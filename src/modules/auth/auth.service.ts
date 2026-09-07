import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import { ConfigService } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';

import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { CaptchaService } from './captcha.service';
import { DeviceService } from './device.service';
import jwtConfig from 'src/config/namespaces/jwt.config';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AccountWithRoles } from '../roles/entities/role.entity';
import { getErrorStack } from 'src/utils/error.util';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { Enable2FADto } from './dto/enable-2fa.dto';

interface MfaTicketPayload {
  sub: number;
  purpose: 'mfa_validation';
}

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type LoginResult = AuthTokens | { mfaRequired: true; mfaTicket: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly captchaService: CaptchaService,
    private readonly deviceService: DeviceService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConf: ConfigType<typeof jwtConfig>,
  ) {}

  /**
   * Internal helper to hash reset tokens for secure database lookup.
   */
  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Registers a new account and hashes credentials.
   *
   * @param data - Registration payload
   * @returns - User data and metadata
   */
  async register(data: RegisterDto): Promise<User> {
    await this.captchaService.verify(data.captchaToken);

    const hashedPassword = await argon2.hash(data.password, {
      type: argon2.argon2id,
    });
    const account = this.userRepository.create({
      ...data,
      password: hashedPassword,
    });

    return await this.userRepository.save(account);
  }

  /**
   * Authenticates credentials and evaluates MFA/Security requirements.
   *
   * @param data - Login credentials and metadata
   * @returns Tokens or MFA requirement state
   * @throws {UnauthorizedException} If the credentials is invalid
   */
  async login(data: LoginDto): Promise<LoginResult> {
    await this.captchaService.verify(data.captchaToken, data.ip);

    const account = await this.userRepository.findOne({
      where: { email: data.email },
      select: ['id', 'email', 'password', 'isTwoFactorEnabled'],
      relations: ['roles', 'roles.permissions'],
    });

    if (!account || !(await argon2.verify(account.password, data.password))) {
      this.logger.warn(`Auth Failure: Invalid attempt for ${data.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (account.isTwoFactorEnabled) {
      const mfaTicket = await this.jwtService.signAsync(
        {
          sub: account.id,
          purpose: 'mfa_validation',
        } satisfies MfaTicketPayload,
        {
          secret: this.jwtConf.accessSecret,
          expiresIn: '3m',
        },
      );
      return { mfaRequired: true, mfaTicket };
    }

    // Background security check
    this.deviceService
      .checkAndAlert(account.id, 'user', account.email, data.ip, data.userAgent)
      .catch((err) =>
        this.logger.error(
          `Device check failed for ${account.email}`,
          getErrorStack(err),
        ),
      );

    this.logger.log(`Auth Success: ${account.email} logged in`);
    return await this.generateTokens(account);
  }

  /**
   * Initializes TOTP-based 2FA for an account.
   *
   * @param userId - Target User Id
   * @returns Secret code, QR code, and URL
   * @throws {BadRequestException} if account is not found
   */
  async generate2FASecret(
    userId: number,
  ): Promise<{ secret: string; qrCode: string; uri: string }> {
    const account = await this.userRepository.findOneBy({ id: userId });

    if (!account) throw new BadRequestException('Account not found');

    const secret = generateSecret();
    const uri = generateURI({
      issuer: this.configService.get<string>('APP_NAME', 'MyApp'),
      label: account.email,
      secret,
    });
    const qrCode = await QRCode.toDataURL(uri);

    await this.userRepository.update(userId, { twoFactorSecret: secret });

    return { secret, qrCode, uri };
  }

  /**
   * Confirms 2FA setup by validating the first OTP token and activating 2FA.
   *
   * @param userId - Target User Id
   * @param data - Enable 2FA payload
   * @throws {BadRequestException} If 2FA has not been generated or code is invalid
   */
  async enable2FA(
    userId: number,
    data: Enable2FADto,
  ): Promise<{ message: string }> {
    const account = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'twoFactorSecret'],
    });

    if (!account?.twoFactorSecret) {
      throw new BadRequestException('2FA not initialized');
    }

    const isValid = await verify({
      secret: account.twoFactorSecret,
      token: data.token,
    });

    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.userRepository.update(userId, { isTwoFactorEnabled: true });
    return { message: 'Two-factor authentication enabled successfully' };
  }

  /**
   * Validates a 2FA token and completes the authentication handshake.
   *
   * @param data - 2 Factor Authentications Data
   * @param ip - IP of the device
   * @param userAgent - User agent of the device
   * @returns Generated access and refresh token
   * @throws {NotFoundException} If account is not found
   * @throws {UnauthorizedException} If 2FA ticket or token is invalid
   */
  async verify2FA(
    data: Verify2FADto,
    ip: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    let payload: MfaTicketPayload;
    try {
      payload = await this.jwtService.verifyAsync<MfaTicketPayload>(
        data.mfaTicket,
        { secret: this.jwtConf.accessSecret },
      );
      if (payload.purpose !== 'mfa_validation') {
        throw new Error();
      }
    } catch {
      throw new UnauthorizedException('MFA ticket expired or invalid');
    }

    const account = await this.userRepository.findOne({
      where: { id: payload.sub },
      select: ['id', 'email', 'twoFactorSecret', 'isTwoFactorEnabled'],
      relations: ['roles', 'roles.permissions'],
    });

    if (!account) {
      throw new NotFoundException(`Account with ID ${payload.sub} not found`);
    }

    if (!account.isTwoFactorEnabled || !account.twoFactorSecret) {
      throw new UnauthorizedException('2FA not active for this account');
    }

    const isValid = await verify({
      secret: account.twoFactorSecret,
      token: data.token,
    });

    if (!isValid) {
      this.logger.warn(`MFA Failure: Invalid token for ID ${payload.sub}`);
      throw new UnauthorizedException('Invalid 2FA token');
    }

    this.deviceService
      .checkAndAlert(account.id, 'user', account.email, ip, userAgent)
      .catch((err) =>
        this.logger.error(`Device check failed`, getErrorStack(err)),
      );

    return await this.generateTokens(account);
  }

  /**
   * Refreshes access token and rotates the refresh token.
   *
   * @param refreshToken - Incoming plain refresh token
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    let payload: { sub: number };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.jwtConf.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const account = await this.userRepository.findOne({
      where: { id: payload.sub },
      select: ['id', 'email', 'refreshTokenHash'],
      relations: ['roles', 'roles.permissions'],
    });

    if (!account || !account.refreshTokenHash) {
      throw new UnauthorizedException('Access Denied');
    }

    const tokenMatches = await argon2.verify(
      account.refreshTokenHash,
      refreshToken,
    );

    if (!tokenMatches) {
      await this.userRepository.update(account.id, { refreshTokenHash: null });
      throw new UnauthorizedException(
        'Token reuse detected. Session invalidated.',
      );
    }

    return await this.generateTokens(account);
  }

  /**
   * Generates a unique password reset link and short-code.
   *
   * @param email - Target email
   */
  async forgotPassword(
    email: string,
  ): Promise<{ message: string; token?: string; resetUrl?: string }> {
    const account = await this.userRepository.findOneBy({ email });

    if (!account) return { message: 'If email exists, code sent' };

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    const shortCode = rawToken.substring(0, 6).toUpperCase();

    const expiryMs =
      Number(this.configService.get<number>('EMAIL_EXPIRY')) ||
      Number(this.configService.get<number>('EXPIRY_EMAIL')) ||
      15 * 60 * 1000;
    const expires = new Date(Date.now() + expiryMs);

    await this.userRepository.update(account.id, {
      passwordResetCode: hashedToken,
      passwordResetExpires: expires,
    });

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}&email=${email}`;

    await this.mailService.sendPasswordResetEmail(email, shortCode, resetUrl);

    return this.configService.get('NODE_ENV') === 'development'
      ? { message: 'Reset link generated', token: rawToken, resetUrl }
      : { message: 'Reset link sent' };
  }

  /**
   * Finalizes credential update using a verified reset token.
   *
   * @param data - Reset Password Payload
   * @throws {BadRequestException} If reset token is invalid or expired
   */
  async resetPassword(data: ResetPasswordDto): Promise<{ message: string }> {
    const hashedToken = this.hashToken(data.code);
    const account = await this.userRepository.findOneBy({
      email: data.email,
      passwordResetCode: hashedToken,
    });

    if (
      !account ||
      !account.passwordResetExpires ||
      account.passwordResetExpires < new Date()
    ) {
      throw new BadRequestException('Invalid or expired code');
    }

    const hashedPassword = await argon2.hash(data.newPassword, {
      type: argon2.argon2id,
    });

    await this.userRepository.update(account.id, {
      password: hashedPassword,
      passwordResetCode: null,
      passwordResetExpires: null,
      refreshTokenHash: null,
    });

    return { message: 'Password updated successfully' };
  }

  /**
   * Issues JWT Access and Refresh tokens.
   * Flattens the existing roles/permissions structure into a unique string array.
   *
   * @param account - User entity
   * @returns Generated access and refresh token
   */
  async generateTokens(account: User): Promise<AuthTokens> {
    const accountWithRoles = account as unknown as AccountWithRoles;

    const roleNames: string[] = accountWithRoles.roles
      ? accountWithRoles.roles.map((r) => r.name).filter(Boolean)
      : [];

    const permissions: string[] = accountWithRoles.roles
      ? accountWithRoles.roles
          .flatMap((r) => r.permissions ?? [])
          .map((p) => p?.name)
          .filter((name): name is string => !!name)
      : [];

    const payload = {
      sub: account.id,
      email: account.email,
      roles: Array.from(new Set(roleNames)),
      permissions: Array.from(new Set(permissions)),
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.jwtConf.accessSecret,
      expiresIn: this.jwtConf.accessExpiry,
    } as JwtSignOptions);

    const refreshToken = await this.jwtService.signAsync({ sub: account.id }, {
      secret: this.jwtConf.refreshSecret,
      expiresIn: this.jwtConf.refreshExpiry,
    } as JwtSignOptions);

    const refreshTokenHash = await argon2.hash(refreshToken, {
      type: argon2.argon2id,
    });
    await this.userRepository.update(account.id, { refreshTokenHash });

    return { accessToken, refreshToken };
  }

  /**
   * Logs out user by invalidating the refresh token hash.
   *
   * @param userId - Target User Id
   */
  async logout(userId: number): Promise<{ message: string }> {
    await this.userRepository.update(userId, { refreshTokenHash: null });
    return { message: 'Logged out successfully' };
  }

  /**
   * Validates or provisions a user arriving via OAuth.
   *
   * @param profile - OAuth Profile payload
   * @returns - Final user tokens
   */
  async validateOAuthUser(profile: {
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<AuthTokens> {
    const { email, firstName, lastName } = profile;

    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions'],
    });

    if (user) {
      this.logger.log(`OAuth Login: ${email} authenticated via Google`);
      return await this.generateTokens(user);
    }

    this.logger.log(`OAuth Provisioning: Creating new account for ${email}`);

    const placeholderPassword = await argon2.hash(
      crypto.randomBytes(64).toString('hex'),
      { type: argon2.argon2id },
    );

    const newUser = this.userRepository.create({
      email,
      username: email.split('@')[0] + crypto.randomInt(1000, 9999),
      displayName: `${firstName} ${lastName}`.trim() || email.split('@')[0],
      password: placeholderPassword,
    });

    const savedUser = await this.userRepository.save(newUser);

    const finalUser = await this.userRepository.findOne({
      where: { id: savedUser.id },
      relations: ['roles', 'roles.permissions'],
    });

    return await this.generateTokens(finalUser!);
  }
}
