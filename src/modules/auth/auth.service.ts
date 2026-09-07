import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
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
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { User } from '../users/entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { MailService } from '../mail/mail.service';
import { CaptchaService } from './captcha.service';
import { DeviceService } from './device.service';
import jwtConfig from 'src/config/namespaces/jwt.config';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { Enable2FADto } from './dto/enable-2fa.dto';
import { AccountWithRoles } from '../roles/entities/role.entity';
import { getErrorStack } from 'src/utils/error.util';

/**
 * Payload encoded into intermediate 2FA validation tickets.
 */
export interface MfaTicketPayload {
  readonly sub: number;
  readonly purpose: 'mfa_validation';
}

/**
 * Payload encoded into long-lived JWT refresh tokens.
 */
export interface RefreshTokenPayload {
  readonly sub: number;
  readonly sid: string;
}

/**
 * Standard authentication token pair issued upon successful handshake.
 */
export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * Intermediate challenge payload issued when 2FA verification is required.
 */
export interface MfaChallengeRequired {
  readonly mfaRequired: true;
  readonly mfaTicket: string;
}

/**
 * Response payload returned by the login workflow.
 */
export type LoginResult = AuthTokens | MfaChallengeRequired;

/**
 * Response payload containing generated 2FA setup credentials.
 */
export interface GeneratedTwoFactorSecret {
  readonly secret: string;
  readonly qrCode: string;
  readonly uri: string;
}

/**
 * Response payload containing the activation message and single-use emergency backup codes.
 */
export interface EnableTwoFactorResult {
  readonly message: string;
  readonly recoveryCodes: string[];
}

/**
 * Core Authentication Service.
 *
 * Coordinates identity registration, credential validation, Argon2id hashing,
 * two-factor authentication (TOTP + recovery codes), multi-device session rotation,
 * and automated brute-force protection.
 *
 * @remarks
 * Security Specifications:
 * - Password Hashing: Argon2id (RFC 9106, 64 MB memory cost, 3 iterations)
 * - Token Storage: SHA-256 hashed digests
 * - Session Invalidation: Automatic Refresh Token Rotation (RTR) with theft detection
 * - Anti-Automation: Cloudflare Turnstile verification & Redis sliding window lockout
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Security Constants
  private static readonly MFA_TICKET_EXPIRY: string = '3m';
  private static readonly SESSION_EXPIRY_DAYS: number = 7;
  private static readonly MAX_FAILED_ATTEMPTS: number = 5;
  private static readonly LOCKOUT_WINDOW_MS: number = 15 * 60 * 1000; // 15 Minutes
  private static readonly RECOVERY_CODE_COUNT: number = 8;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly captchaService: CaptchaService,
    private readonly deviceService: DeviceService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @Inject(jwtConfig.KEY)
    private readonly jwtConf: ConfigType<typeof jwtConfig>,
  ) {}

  /**
   * Computes a cryptographic SHA-256 hash of high-entropy input strings.
   *
   * @param raw - Plaintext token or code
   * @returns Hex-encoded 64-character SHA-256 digest
   * @internal
   */
  private hashDigest(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Hashes a password using Argon2id with 64MB memory cost.
   * Explicitly returns string to guarantee correct overload resolution.
   * @param password - plaintext password
   * @returns - Aragon hash
   * @internal
   */
  private async hashPassword(password: string): Promise<string> {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  }

  /**
   * Helper to normalize otplib verification outputs (supports boolean and VerifyResult objects).
   */
  private parseVerifyResult(result: unknown): boolean {
    if (typeof result === 'boolean') {
      return result;
    }
    if (typeof result === 'object' && result !== null && 'valid' in result) {
      return Boolean((result as { valid: boolean }).valid);
    }
    return Boolean(result);
  }

  // ===========================================================================
  // BRUTE-FORCE PROTECTION (REDIS-BACKED)
  // ===========================================================================

  /**
   * Evaluates whether an email address is actively locked out due to excessive failed attempts.
   *
   * @param email - Target user email address
   * @throws HttpException - If the account is temporarily locked (HTTP 429)
   * @internal
   */
  private async checkLockoutThreshold(email: string): Promise<void> {
    const isLocked = await this.cacheManager.get<boolean>(`lockout:${email}`);
    if (isLocked) {
      this.logger.warn(
        `Security Shield: Blocked attempt on locked account ${email}`,
      );
      throw new HttpException(
        'Account is temporarily locked due to excessive failed login attempts. Try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Increments the failed login attempt counter and sets the lockout flag if threshold is exceeded.
   *
   * @param email - Target user email address
   * @internal
   */
  private async registerFailedAttempt(email: string): Promise<void> {
    const key = `failed_attempts:${email}`;
    const attempts = ((await this.cacheManager.get<number>(key)) || 0) + 1;

    await this.cacheManager.set(key, attempts, AuthService.LOCKOUT_WINDOW_MS);

    if (attempts >= AuthService.MAX_FAILED_ATTEMPTS) {
      await this.cacheManager.set(
        `lockout:${email}`,
        true,
        AuthService.LOCKOUT_WINDOW_MS,
      );
      await this.cacheManager.del(key);
      this.logger.error(
        `Security Incident: Account ${email} locked out for 15 minutes.`,
      );
    }
  }

  /**
   * Clears active failed attempt counters and lockout records for a specific email.
   *
   * @param email - Target user email address
   * @internal
   */
  private async clearLockoutHistory(email: string): Promise<void> {
    await this.cacheManager.del(`failed_attempts:${email}`);
    await this.cacheManager.del(`lockout:${email}`);
  }

  // ===========================================================================
  // CORE AUTHENTICATION WORKFLOWS
  // ===========================================================================

  /**
   * Provisions a standard user account with Argon2id credential hashing.
   *
   * @param data - User registration payload including credentials and optional CAPTCHA token
   * @returns Newly created and persisted User entity
   * @throws BadRequestException - If CAPTCHA validation fails or uniqueness constraint is violated
   */
  async register(data: RegisterDto): Promise<User> {
    await this.captchaService.verify(data.captchaToken);

    const hashedPassword = await this.hashPassword(data.password);

    const account = this.userRepository.create({
      ...data,
      password: hashedPassword,
    });

    return await this.userRepository.save(account);
  }

  /**
   * Authenticates user credentials, enforces suspension checks, and evaluates MFA state.
   *
   * @param data - Login payload containing email, password, client IP, and User-Agent
   * @returns Standard token pair or an intermediate MFA ticket if 2FA is active
   * @throws UnauthorizedException - If credentials are invalid, or if the account is suspended
   * @throws HttpException - If the account is currently locked out (HTTP 429)
   */
  async login(data: LoginDto): Promise<LoginResult> {
    await this.checkLockoutThreshold(data.email);
    await this.captchaService.verify(data.captchaToken, data.ip);

    const account = await this.userRepository.findOne({
      where: { email: data.email },
      select: [
        'id',
        'email',
        'password',
        'isTwoFactorEnabled',
        'isBanned',
        'banReason',
      ],
      relations: ['roles', 'roles.permissions'],
    });

    if (!account || !(await argon2.verify(account.password, data.password))) {
      await this.registerFailedAttempt(data.email);
      this.logger.warn(
        `Authentication Failed: Invalid attempt for ${data.email}`,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    if (account.isBanned) {
      this.logger.warn(
        `Access Denied: Banned user ${account.id} attempted authentication`,
      );
      throw new UnauthorizedException(
        `Account has been suspended. Reason: ${account.banReason || 'Administrative decision'}`,
      );
    }

    // Reset failed counter upon successful password verification
    await this.clearLockoutHistory(data.email);

    // If 2FA is active, issue an intermediate 3-minute ticket
    if (account.isTwoFactorEnabled) {
      const mfaTicket = await this.jwtService.signAsync(
        {
          sub: account.id,
          purpose: 'mfa_validation',
        } satisfies MfaTicketPayload,
        {
          secret: this.jwtConf.accessSecret,
          expiresIn: AuthService.MFA_TICKET_EXPIRY,
        } as JwtSignOptions,
      );

      return { mfaRequired: true, mfaTicket };
    }

    // Asynchronously analyze device fingerprint
    this.deviceService
      .checkAndAlert(account.id, 'user', account.email, data.ip, data.userAgent)
      .catch((err: unknown) =>
        this.logger.error(
          `Device tracking failed for ${account.email}`,
          getErrorStack(err),
        ),
      );

    return await this.createSessionAndGenerateTokens(
      account,
      data.ip,
      data.userAgent,
    );
  }

  // ===========================================================================
  // TWO-FACTOR AUTHENTICATION (TOTP + EMERGENCY RECOVERY CODES)
  // ===========================================================================

  /**
   * Initializes TOTP-based 2FA setup by generating a Base32 secret and QR code URI.
   *
   * @param userId - Target user identifier resolved from authenticated JWT context
   * @returns Base32 secret, Base64 QR code image, and standard otpauth URI
   * @throws BadRequestException - If the user record cannot be located
   */
  async generate2FASecret(userId: number): Promise<GeneratedTwoFactorSecret> {
    const account = await this.userRepository.findOneBy({ id: userId });
    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const secret = generateSecret();
    const uri = generateURI({
      issuer: this.configService.get<string>('APP_NAME', 'MyApp'),
      label: account.email,
      secret,
    });
    const qrCode = await QRCode.toDataURL(uri);

    // Store pending secret without enabling 2FA immediately
    await this.userRepository.update(userId, {
      twoFactorSecret: secret,
      isTwoFactorEnabled: false,
    });

    return { secret, qrCode, uri };
  }

  /**
   * Confirms the initial TOTP code, enables 2FA, and generates single-use emergency backup codes.
   *
   * @param userId - Target user identifier
   * @param data - Payload containing the 6-digit confirmation code
   * @returns Success confirmation and the list of unhashed single-use backup codes
   * @throws BadRequestException - If secret was not generated or the code is invalid
   */
  async enable2FA(
    userId: number,
    data: Enable2FADto,
  ): Promise<EnableTwoFactorResult> {
    const account = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'twoFactorSecret'],
    });

    if (!account?.twoFactorSecret) {
      throw new BadRequestException(
        'Two-factor setup has not been initialized',
      );
    }

    const isValid = await verify({
      secret: account.twoFactorSecret,
      token: data.token,
    });

    if (!isValid) {
      throw new BadRequestException(
        'Invalid verification code. Two-factor activation aborted.',
      );
    }

    // Generate 8 single-use emergency recovery codes (Format: XXXX-XXXX)
    const rawRecoveryCodes: string[] = [];
    const hashedRecoveryCodes: string[] = [];

    for (let i = 0; i < AuthService.RECOVERY_CODE_COUNT; i++) {
      const partA = crypto.randomBytes(2).toString('hex').toUpperCase();
      const partB = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = `${partA}-${partB}`;

      rawRecoveryCodes.push(code);
      hashedRecoveryCodes.push(this.hashDigest(code.replace('-', '')));
    }

    await this.userRepository.update(userId, {
      isTwoFactorEnabled: true,
      twoFactorRecoveryCodes: hashedRecoveryCodes,
    });

    this.logger.log(
      `Security: Two-factor authentication activated for user ${userId}`,
    );

    return {
      message:
        'Two-factor authentication activated. Save these backup codes securely.',
      recoveryCodes: rawRecoveryCodes,
    };
  }

  /**
   * Finalizes the MFA challenge using either a 6-digit TOTP token or a backup recovery code.
   *
   * @param data - MFA ticket and 6-digit TOTP code or recovery code string
   * @param ip - Remote client IP address
   * @param userAgent - Client browser/device identifier
   * @returns Access and refresh token pair
   * @throws UnauthorizedException - If the MFA ticket is invalid, or the code does not match
   * @throws NotFoundException - If the target user record no longer exists
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
        throw new Error('Invalid ticket purpose');
      }
    } catch {
      throw new UnauthorizedException(
        'MFA verification ticket has expired or is invalid',
      );
    }

    const account = await this.userRepository.findOne({
      where: { id: payload.sub },
      select: [
        'id',
        'email',
        'twoFactorSecret',
        'twoFactorRecoveryCodes',
        'isTwoFactorEnabled',
        'isBanned',
      ],
      relations: ['roles', 'roles.permissions'],
    });

    if (!account || account.isBanned || !account.isTwoFactorEnabled) {
      throw new UnauthorizedException(
        'MFA verification denied for this account',
      );
    }

    let isCodeValid = false;
    const sanitizedToken = data.token.trim().replace('-', '');

    // 1. Validate against TOTP standard (6-digit numeric string)
    if (
      sanitizedToken.length === 6 &&
      /^\d+$/.test(sanitizedToken) &&
      account.twoFactorSecret
    ) {
      const rawResult = await verify({
        secret: account.twoFactorSecret,
        token: sanitizedToken,
      });
      isCodeValid = this.parseVerifyResult(rawResult);
    }

    // 2. Fallback: Validate against single-use recovery codes
    if (!isCodeValid && account.twoFactorRecoveryCodes) {
      const hashedInput = this.hashDigest(sanitizedToken.toUpperCase());
      const matchIndex = account.twoFactorRecoveryCodes.indexOf(hashedInput);

      if (matchIndex !== -1) {
        isCodeValid = true;
        // Consume the recovery code (Atomic removal)
        account.twoFactorRecoveryCodes.splice(matchIndex, 1);
        await this.userRepository.update(account.id, {
          twoFactorRecoveryCodes: account.twoFactorRecoveryCodes,
        });

        this.logger.warn(
          `Security Alert: User ${account.id} consumed an emergency recovery code.`,
        );
      }
    }

    if (!isCodeValid) {
      this.logger.warn(
        `MFA Validation Failed: Invalid code provided for user ${account.id}`,
      );
      throw new UnauthorizedException('Invalid two-factor authentication code');
    }

    this.deviceService
      .checkAndAlert(account.id, 'user', account.email, ip, userAgent)
      .catch((err: unknown) =>
        this.logger.error(
          `Device check failed for user ${account.id}`,
          getErrorStack(err),
        ),
      );

    return await this.createSessionAndGenerateTokens(account, ip, userAgent);
  }

  // ===========================================================================
  // REFRESH TOKEN ROTATION (RTR) & SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Rotates access and refresh tokens for a specific device session with theft detection.
   *
   * @param refreshToken - Incoming plain JWT refresh token presented by the client
   * @param ip - Current remote IP address
   * @param userAgent - Current User-Agent string
   * @returns Rotated Access and Refresh token pair
   * @throws UnauthorizedException - If token is expired, revoked, or if reuse is detected
   */
  async refreshTokens(
    refreshToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: this.jwtConf.refreshSecret },
      );
    } catch {
      throw new UnauthorizedException(
        'Refresh token is invalid or has expired',
      );
    }

    const session = await this.sessionRepository.findOne({
      where: { id: payload.sid, userId: payload.sub },
      relations: ['user', 'user.roles', 'user.roles.permissions'],
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session has expired or been revoked');
    }

    if (session.user.isBanned) {
      throw new UnauthorizedException('Account has been suspended');
    }

    // SHA-256 verification against stored hash
    const incomingDigest = this.hashDigest(refreshToken);
    if (session.refreshTokenHash !== incomingDigest) {
      // REUSE DETECTED: Revoke this specific session immediately
      await this.sessionRepository.update(session.id, { isRevoked: true });
      this.logger.error(
        `Critical Security Alert: Token reuse detected on session ${session.id}. Session revoked.`,
      );
      throw new UnauthorizedException(
        'Token reuse detected. Session has been terminated.',
      );
    }

    return await this.rotateSessionTokens(session, session.user, ip, userAgent);
  }

  /**
   * Retrieves all active device sessions for a given user identifier.
   *
   * @param userId - Target user identifier
   * @returns Array of active device session metadata
   */
  async listUserSessions(userId: number): Promise<UserSession[]> {
    return await this.sessionRepository.find({
      where: { userId, isRevoked: false },
      select: ['id', 'ipAddress', 'userAgent', 'lastActiveAt', 'createdAt'],
      order: { lastActiveAt: 'DESC' },
    });
  }

  /**
   * Remotely revokes a specific device session.
   *
   * @param userId - Target user identifier
   * @param sessionId - Unique session UUID to revoke
   * @returns Confirmation message
   * @throws NotFoundException - If the target session does not exist or does not belong to the user
   */
  async revokeSession(
    userId: number,
    sessionId: string,
  ): Promise<{ message: string }> {
    const result = await this.sessionRepository.update(
      { id: sessionId, userId },
      { isRevoked: true },
    );

    if (!result.affected) {
      throw new NotFoundException('Session not found or already revoked');
    }

    return { message: 'Session successfully revoked' };
  }

  /**
   * Logs out the calling device by removing its specific session record.
   *
   * @param refreshToken - The refresh token presented by the active client
   * @returns Logout confirmation message
   */
  async logoutSession(refreshToken: string): Promise<{ message: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: this.jwtConf.refreshSecret },
      );
      await this.sessionRepository.delete({ id: payload.sid });
    } catch {
      // Silently swallow errors if the token is already expired or malformed
    }

    return { message: 'Logged out successfully' };
  }

  /**
   * Globally invalidates all active device sessions for a user (Emergency Logout).
   *
   * @param userId - Target user identifier
   * @returns Confirmation message
   */
  async logoutAllSessions(userId: number): Promise<{ message: string }> {
    await this.sessionRepository.delete({ userId });
    this.logger.warn(
      `Security: Global session purge executed for user ID ${userId}`,
    );
    return { message: 'All active sessions have been terminated' };
  }

  // ===========================================================================
  // PASSWORD RECOVERY WORKFLOWS
  // ===========================================================================

  /**
   * Dispatches a single-use password recovery token via email.
   *
   * @param email - Target user email address
   * @returns Generic response to prevent user enumeration attacks
   */
  async forgotPassword(
    email: string,
  ): Promise<{ message: string; token?: string; resetUrl?: string }> {
    const account = await this.userRepository.findOneBy({ email });
    if (!account) {
      return {
        message:
          'If the email is registered, a password reset link was dispatched.',
      };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = this.hashDigest(rawToken);
    const shortCode = rawToken.substring(0, 6).toUpperCase();

    const expiryMs =
      Number(this.configService.get<number>('EMAIL_EXPIRY')) || 15 * 60 * 1000;
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
      : {
          message:
            'If the email is registered, a password reset link was dispatched.',
        };
  }

  /**
   * Consumes a recovery token, updates the password hash, and purges all active sessions.
   *
   * @param data - Recovery payload containing email, plaintext token, and new password
   * @returns Confirmation message
   * @throws BadRequestException - If the token is invalid, expired, or already consumed
   */
  async resetPassword(data: ResetPasswordDto): Promise<{ message: string }> {
    const hashedToken = this.hashDigest(data.code);
    const account = await this.userRepository.findOneBy({
      email: data.email,
      passwordResetCode: hashedToken,
    });

    if (
      !account ||
      !account.passwordResetExpires ||
      account.passwordResetExpires < new Date()
    ) {
      throw new BadRequestException(
        'Password reset code is invalid or has expired',
      );
    }

    const hashedPassword = await this.hashPassword(data.newPassword);

    // 1. Persist new credentials and consume the recovery token
    await this.userRepository.update(account.id, {
      password: hashedPassword,
      passwordResetCode: null,
      passwordResetExpires: null,
    });

    // 2. Globally invalidate all active device sessions for security
    await this.sessionRepository.delete({ userId: account.id });

    this.logger.log(
      `Security: Password reset completed for user ${account.id}. All sessions purged.`,
    );
    return { message: 'Password updated successfully. Please log in again.' };
  }

  // ===========================================================================
  // INTERNAL TOKEN PROVISIONING HELPERS
  // ===========================================================================

  /**
   * Creates a dedicated `UserSession` database record and issues a linked token pair.
   *
   * @param account - Target user entity
   * @param ip - Client IP address
   * @param userAgent - Client User-Agent string
   * @returns Generated access and refresh token pair
   * @internal
   */
  private async createSessionAndGenerateTokens(
    account: User,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const sessionExpiry = new Date(
      Date.now() + AuthService.SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    // 1. Create a session record to allocate a unique UUID
    const session = this.sessionRepository.create({
      userId: account.id,
      ipAddress: ip || '127.0.0.1',
      userAgent: userAgent || 'Unknown Device',
      expiresAt: sessionExpiry,
      refreshTokenHash: 'pending',
    });

    const savedSession = await this.sessionRepository.save(session);

    // 2. Generate token pair bound to the session UUID
    const tokens = await this.signTokenPair(account, savedSession.id);

    // 3. Persist SHA-256 hash of the issued refresh token
    savedSession.refreshTokenHash = this.hashDigest(tokens.refreshToken);
    await this.sessionRepository.save(savedSession);

    return tokens;
  }

  /**
   * Rotates the refresh token for an existing session record.
   *
   * @param session - Target session entity
   * @param user - Target user entity
   * @param ip - Client IP address
   * @param userAgent - Client User-Agent string
   * @returns Rotated access and refresh token pair
   * @internal
   */
  private async rotateSessionTokens(
    session: UserSession,
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const tokens = await this.signTokenPair(user, session.id);

    session.refreshTokenHash = this.hashDigest(tokens.refreshToken);
    if (ip) session.ipAddress = ip;
    if (userAgent) session.userAgent = userAgent;
    session.lastActiveAt = new Date();

    await this.sessionRepository.save(session);
    return tokens;
  }

  /**
   * Signs Access and Refresh JWT payloads.
   *
   * @param account - User entity
   * @param sessionId - Bound session UUID
   * @returns Signed Access and Refresh token strings
   * @internal
   */
  private async signTokenPair(
    account: User,
    sessionId: string,
  ): Promise<AuthTokens> {
    const accountWithRoles = account as unknown as AccountWithRoles;

    const roleNames: string[] =
      accountWithRoles.roles?.map((r) => r.name).filter(Boolean) ?? [];

    const permissions: string[] =
      accountWithRoles.roles
        ?.flatMap((r) => r.permissions ?? [])
        .map((p) => p?.name)
        .filter((name): name is string => Boolean(name)) ?? [];

    const accessToken = await this.jwtService.signAsync(
      {
        sub: account.id,
        email: account.email,
        roles: Array.from(new Set(roleNames)),
        permissions: Array.from(new Set(permissions)),
      },
      {
        secret: this.jwtConf.accessSecret,
        expiresIn: this.jwtConf.accessExpiry,
      } as JwtSignOptions,
    );

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: account.id,
        sid: sessionId,
      } satisfies RefreshTokenPayload,
      {
        secret: this.jwtConf.refreshSecret,
        expiresIn: this.jwtConf.refreshExpiry,
      } as JwtSignOptions,
    );

    return { accessToken, refreshToken };
  }

  // ===========================================================================
  // OAUTH 2.0 INTEGRATION
  // ===========================================================================

  /**
   * Validates or provisions a user authenticating via OAuth 2.0 (e.g., Google).
   *
   * @param profile - Normalized OAuth profile payload
   * @returns Tokens issued for the newly established session
   */
  async validateOAuthUser(profile: {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
  }): Promise<AuthTokens> {
    const { email, firstName, lastName } = profile;

    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions'],
    });

    if (user) {
      this.logger.log(
        `OAuth Authentication: User ${email} authenticated successfully`,
      );
      return await this.createSessionAndGenerateTokens(user);
    }

    this.logger.log(`OAuth Provisioning: Creating new account for ${email}`);

    const placeholderPassword = await this.hashPassword(
      crypto.randomBytes(64).toString('hex'),
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

    return await this.createSessionAndGenerateTokens(finalUser!);
  }
}
