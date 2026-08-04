import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import type { ConfigService, ConfigType } from '@nestjs/config';

import { User } from '../users/entities/user.entity';
import { Admin } from '../admins/entities/admin.entity';
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly captchaService: CaptchaService,
    private readonly deviceService: DeviceService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConf: ConfigType<typeof jwtConfig>,
  ) {}

  /**
   * Internal helper to resolve the appropriate repository based on account type.
   */
  private getRepo(type: 'user' | 'admin') {
    return type === 'admin' ? this.adminRepository : this.userRepository;
  }

  /**
   * Registers a new account and hashes credentials.
   *
   * @param data - Registration payload
   * @param accountType - Target entity table
   */
  async register(data: RegisterDto, accountType: 'user' | 'admin' = 'user') {
    await this.captchaService.verify(data.captchaToken);
    const repo = this.getRepo(accountType);

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const account = repo.create({ ...data, password: hashedPassword });

    return repo.save(account);
  }

  /**
   * Authenticates credentials and evaluates MFA/Security requirements.
   *
   * @param data - Login credentials and metadata
   * @param accountType - Entity discriminator
   * @returns Tokens or MFA requirement state
   */
  async login(data: LoginDto, accountType: 'user' | 'admin' = 'user') {
    await this.captchaService.verify(data.captchaToken, data.ip);
    const repo = this.getRepo(accountType);

    const account = await repo.findOne({
      where: { email: data.email },
      select: ['id', 'email', 'password', 'isTwoFactorEnabled'],
      relations: ['roles', 'roles.permissions'],
    });

    if (!account || !(await bcrypt.compare(data.password, account.password))) {
      this.logger.warn(`Auth Failure: Invalid attempt for ${data.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (account.isTwoFactorEnabled) {
      return { mfaRequired: true, userId: account.id, accountType };
    }

    // Background security check
    this.deviceService
      .checkAndAlert(
        account.id,
        accountType,
        account.email,
        data.ip,
        data.userAgent,
      )
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
   */
  async generate2FASecret(
    userId: number,
    accountType: 'user' | 'admin' = 'user',
  ) {
    const repo = this.getRepo(accountType);
    const account = await repo.findOneBy({ id: userId });

    if (!account) throw new BadRequestException('Account not found');

    const secret = generateSecret();
    const uri = generateURI({
      issuer: 'AuthService',
      label: account.email,
      secret,
    });
    const qrCode = await QRCode.toDataURL(uri);

    await repo.update(userId, { twoFactorSecret: secret });

    return { secret, qrCode, uri };
  }

  /**
   * Validates a 2FA token and completes the authentication handshake.
   */
  async verify2FA(data: Verify2FADto, ip: string, userAgent: string) {
    const { userId, token, accountType = 'user' } = data;
    const repo = this.getRepo(accountType);

    const account = await repo.findOne({
      where: { id: userId },
      relations: ['roles', 'roles.permissions'],
    });

    if (!account?.twoFactorSecret)
      throw new UnauthorizedException('2FA not initialized');

    const isValid = await verify({ secret: account.twoFactorSecret, token });
    if (!isValid) {
      this.logger.warn(`MFA Failure: Invalid token for ID ${userId}`);
      throw new UnauthorizedException('Invalid 2FA token');
    }

    await repo.update(userId, { isTwoFactorEnabled: true });

    this.deviceService
      .checkAndAlert(account.id, accountType, account.email, ip, userAgent)
      .catch((err) =>
        this.logger.error(`Device check failed`, getErrorStack(err)),
      );

    return await this.generateTokens(account);
  }

  /**
   * Generates a unique password reset link and short-code.
   */
  async forgotPassword(email: string, accountType: 'user' | 'admin' = 'user') {
    const repo = this.getRepo(accountType);
    const account = await repo.findOneBy({ email });

    if (!account) return { message: 'If email exists, code sent' };

    const token = crypto.randomBytes(32).toString('hex');
    const shortCode = token.substring(0, 6).toUpperCase();
    const expires = new Date(
      Date.now() + this.configService.get<number>('EXPIRY_EMAIL')!,
    );

    await repo.update(account.id, {
      passwordResetCode: token,
      passwordResetExpires: expires,
    });

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const resetUrl = `${frontendUrl}/reset-password?token=${token}&email=${email}`;

    await this.mailService.sendPasswordResetEmail(email, shortCode, resetUrl);

    return this.configService.get('NODE_ENV') === 'development'
      ? { message: 'Reset link generated', token, resetUrl }
      : { message: 'Reset link sent' };
  }

  /**
   * Finalizes credential update using a verified reset token.
   */
  async resetPassword(
    data: ResetPasswordDto,
    accountType: 'user' | 'admin' = 'user',
  ) {
    const repo = this.getRepo(accountType);
    const account = await repo.findOneBy({
      email: data.email,
      passwordResetCode: data.code,
    });

    if (
      !account ||
      !account.passwordResetExpires ||
      account.passwordResetExpires < new Date()
    ) {
      throw new BadRequestException('Invalid or expired code');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);
    await repo.update(account.id, {
      password: hashedPassword,
      passwordResetCode: null,
      passwordResetExpires: null,
    });

    return { message: 'Password updated successfully' };
  }

  /**
   * Issues JWT Access and Refresh tokens.
   * Flattens the existing roles/permissions structure into a unique string array.
   */
  async generateTokens(account: User | Admin) {
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
      type: account instanceof Admin ? 'admin' : 'user',
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

    return { accessToken, refreshToken };
  }

  /**
   * Validates or provisions a user arriving via OAuth.
   *
   * @param profile - The normalized data from the OAuth strategy
   */
  async validateOAuthUser(profile: {
    email: string;
    firstName: string;
    lastName: string;
  }) {
    const { email, firstName, lastName } = profile;
    const repo = this.userRepository; // OAuth usually targets standard users

    // 1. Check for existing user
    const user = await repo.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions'],
    });

    if (user) {
      this.logger.log(`OAuth Login: ${email} authenticated via Google`);
      return this.generateTokens(user);
    }

    // 2. Provision new user if not found
    this.logger.log(`OAuth Provisioning: Creating new account for ${email}`);

    // Generate unusable password for security
    const placeholderPassword = await bcrypt.hash(
      crypto.randomBytes(64).toString('hex'),
      10,
    );

    const newUser = repo.create({
      email,
      username: email.split('@')[0] + crypto.randomInt(1000, 9999),
      displayName: `${firstName} ${lastName}`.trim() || email.split('@')[0],
      password: placeholderPassword,
    });

    // Optional: Assign a default 'user' role here if your Role system is ready
    // newUser.roles = [await this.roleRepo.findOneBy({ name: 'user' })];

    const savedUser = await repo.save(newUser);

    // Re-fetch to ensure relations are loaded for token generation
    const finalUser = await repo.findOne({
      where: { id: savedUser.id },
      relations: ['roles', 'roles.permissions'],
    });

    return this.generateTokens(finalUser!);
  }
}
