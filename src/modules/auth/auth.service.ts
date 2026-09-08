import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

import { User } from '../users/entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { CaptchaService } from './captcha.service';
import { DeviceService } from './device.service';
import { AuthLockoutService } from './services/auth-lockout.service';
import { TokenSessionService } from './services/token-session.service';
import { TwoFactorService } from './services/two-factor.service';
import { PasswordResetService } from './services/password-reset.service';
import { AuthCryptoUtil } from './utils/auth-crypto.util';
import { getErrorStack } from 'src/utils/error.util';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { Enable2FADto } from './dto/enable-2fa.dto';
import {
  LoginResult,
  AuthTokens,
  GeneratedTwoFactorSecret,
  EnableTwoFactorResult,
} from './types/auth.types';
import { EmailVerifyService } from './services/email-verify.service';

/**
 * Core Authentication Orchestrator.
 *
 * Serves as the primary entry point and facade for identity registration,
 * credential verification, OAuth provisioning, and delegates specialized workflows
 * (lockout, sessions, 2FA, password recovery) to dedicated domain services.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly captchaService: CaptchaService,
    private readonly deviceService: DeviceService,
    private readonly lockoutService: AuthLockoutService,
    private readonly tokenSessionService: TokenSessionService,
    private readonly twoFactorService: TwoFactorService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailVerifyService: EmailVerifyService,
  ) {}

  // ===========================================================================
  // CORE AUTHENTICATION WORKFLOWS
  // ===========================================================================

  /**
   * Provisions a standard user account with Argon2id credential hashing.
   *
   * @param data - User registration payload with credentials and CAPTCHA token
   * @returns Newly persisted User entity
   */
  async register(data: RegisterDto): Promise<User> {
    await this.captchaService.verify(data.captchaToken);

    const hashedPassword = await AuthCryptoUtil.hashPassword(data.password);

    const account = this.userRepository.create({
      ...data,
      password: hashedPassword,
    });

    const savedAccount = await this.userRepository.save(account);

    // Automatically dispatch email verification link on signup
    await this.emailVerifyService.sendVerificationEmail(savedAccount);

    return savedAccount;
  }
  /**
   * Authenticates user credentials, enforces suspension checks, and evaluates MFA state.
   *
   * @param data - Login payload containing email, password, IP, and User-Agent
   * @returns Active token pair or an intermediate MFA challenge ticket
   * @throws UnauthorizedException - If credentials are invalid or account is suspended
   * @throws HttpException - If account is temporarily locked out (HTTP 429)
   */

  private static readonly DUMMY_ARGON2_HASH =
    '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHRzb21lc2FsdA$R7BYsDeUsm0K0K1bF2U7nF3qZgZ5uU6lX8W+9vK+m5E';
  async login(data: LoginDto): Promise<LoginResult> {
    await this.lockoutService.checkLockoutThreshold(data.email);
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

    const passwordHash = account?.password ?? AuthService.DUMMY_ARGON2_HASH;
    const isPasswordValid = await AuthCryptoUtil.verifyPassword(
      passwordHash,
      data.password,
    );

    if (!account || !isPasswordValid) {
      await this.lockoutService.registerFailedAttempt(data.email);
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

    // Reset failed counter upon successful verification
    await this.lockoutService.clearLockoutHistory(data.email);

    // If 2FA is active, issue an intermediate 3-minute ticket
    if (account.isTwoFactorEnabled) {
      const mfaTicket = await this.twoFactorService.generateTicket(account.id);
      return { mfaRequired: true, mfaTicket };
    }

    // Asynchronously log device fingerprint
    this.triggerDeviceAlert(account.id, account.email, data.ip, data.userAgent);

    return await this.tokenSessionService.createSessionAndGenerateTokens(
      account,
      data.ip,
      data.userAgent,
    );
  }

  /**
   * Finalizes the MFA challenge using either a 6-digit TOTP code or backup recovery code.
   *
   * @param data - MFA verification payload containing intermediate ticket and token
   * @param ip - Remote client IP address
   * @param userAgent - Client browser/device identifier
   * @returns Active token pair
   * @throws UnauthorizedException - If ticket or verification code is invalid
   */
  async verify2FA(
    data: Verify2FADto,
    ip: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    const userId = await this.twoFactorService.verifyTicket(data.mfaTicket);

    const account = await this.userRepository.findOne({
      where: { id: userId },
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

    await this.twoFactorService.validateCodeOrRecovery(account, data.token);

    this.triggerDeviceAlert(account.id, account.email, ip, userAgent);

    return await this.tokenSessionService.createSessionAndGenerateTokens(
      account,
      ip,
      userAgent,
    );
  }

  // ===========================================================================
  // EMAIL VERIFICATION DELEGATIONS
  // ===========================================================================

  /**
   * Consumes a single-use verification token and activates the user account.
   *
   * @param token - Raw verification token string
   * @returns Confirmation result payload
   */
  async verifyEmail(token: string): Promise<{ readonly message: string }> {
    return await this.emailVerifyService.verifyEmail(token);
  }

  /**
   * Resends a fresh email verification link if the account is unverified.
   *
   * @param email - Target account email address
   * @returns Confirmation result payload
   */
  async resendVerificationEmail(
    email: string,
  ): Promise<{ readonly message: string }> {
    return await this.emailVerifyService.resendVerificationEmail(email);
  }

  // ===========================================================================
  // TWO-FACTOR SETUP DELEGATIONS
  // ===========================================================================

  /**
   * Generates a new TOTP secret and QR code URI for 2FA onboarding.
   *
   * @param userId - Target user identifier
   * @returns Base32 secret, Base64 QR code image, and otpauth URI
   */
  async generate2FASecret(userId: number): Promise<GeneratedTwoFactorSecret> {
    return await this.twoFactorService.generateSecret(userId);
  }

  /**
   * Confirms initial TOTP code, activates 2FA, and generates recovery backup codes.
   *
   * @param userId - Target user identifier
   * @param data - Payload containing the 6-digit activation code
   * @returns Confirmation message and unhashed recovery codes
   */
  async enable2FA(
    userId: number,
    data: Enable2FADto,
  ): Promise<EnableTwoFactorResult> {
    return await this.twoFactorService.enable(userId, data.token);
  }

  // ===========================================================================
  // SESSION & TOKEN ROTATION DELEGATIONS
  // ===========================================================================

  /**
   * Validates refresh token and performs Refresh Token Rotation (RTR) with theft detection.
   *
   * @param refreshToken - Raw incoming JWT refresh token
   * @param ip - Remote client IP address
   * @param userAgent - Client browser/device identifier
   * @returns Rotated token pair
   */
  async refreshTokens(
    refreshToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    return await this.tokenSessionService.refreshTokens(
      refreshToken,
      ip,
      userAgent,
    );
  }

  /**
   * Lists all active device sessions for a user.
   *
   * @param userId - Target user identifier
   * @returns Array of active session records
   */
  async listUserSessions(userId: number): Promise<UserSession[]> {
    return await this.tokenSessionService.listUserSessions(userId);
  }

  /**
   * Remotely revokes a specific device session.
   *
   * @param userId - Target user identifier
   * @param sessionId - Unique session ID to revoke
   * @returns Confirmation message
   */
  async revokeSession(
    userId: number,
    sessionId: string,
  ): Promise<{ message: string }> {
    await this.tokenSessionService.revokeSession(userId, sessionId);
    return { message: 'Session successfully revoked' };
  }

  /**
   * Terminates the current device session.
   *
   * @param refreshToken - Raw JWT refresh token presented by the active client
   * @returns Logout confirmation message
   */
  async logoutSession(refreshToken: string): Promise<{ message: string }> {
    await this.tokenSessionService.logoutSession(refreshToken);
    return { message: 'Logged out successfully' };
  }

  /**
   * Globally terminates all active sessions for a user.
   *
   * @param userId - Target user identifier
   * @returns Confirmation message
   */
  async logoutAllSessions(userId: number): Promise<{ message: string }> {
    await this.tokenSessionService.logoutAllSessions(userId);
    return { message: 'All active sessions have been terminated' };
  }

  // ===========================================================================
  // PASSWORD RECOVERY DELEGATIONS
  // ===========================================================================

  /**
   * Generates and dispatches a single-use password recovery email.
   *
   * @param email - Target user email address
   * @returns Confirmation payload
   */
  async forgotPassword(
    email: string,
  ): Promise<{ message: string; token?: string; resetUrl?: string }> {
    return await this.passwordResetService.forgotPassword(email);
  }

  /**
   * Verifies reset token, updates password hash, and purges all active sessions.
   *
   * @param data - Recovery payload containing email, token, and new password
   * @returns Confirmation message
   */
  async resetPassword(data: ResetPasswordDto): Promise<{ message: string }> {
    return await this.passwordResetService.resetPassword(data);
  }

  // ===========================================================================
  // OAUTH 2.0 WORKFLOW
  // ===========================================================================

  /**
   * Validates or provisions a user authenticating via OAuth 2.0.
   *
   * @param profile - Normalized OAuth profile payload
   * @returns Issued token pair for the established session
   */
  async validateOAuthUser(profile: {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
  }): Promise<AuthTokens> {
    const { email, firstName, lastName } = profile;

    let user = await this.userRepository.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions'],
    });

    if (user) {
      this.logger.log(
        `OAuth Authentication: User ${email} authenticated successfully`,
      );
      return await this.tokenSessionService.createSessionAndGenerateTokens(
        user,
      );
    }

    this.logger.log(`OAuth Provisioning: Creating new account for ${email}`);

    const placeholderPassword = await AuthCryptoUtil.hashPassword(
      crypto.randomBytes(64).toString('hex'),
    );

    const newUser = this.userRepository.create({
      email,
      username: email.split('@')[0] + crypto.randomInt(1000, 9999),
      displayName: `${firstName} ${lastName}`.trim() || email.split('@')[0],
      password: placeholderPassword,
    });

    user = await this.userRepository.save(newUser);

    const finalUser = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['roles', 'roles.permissions'],
    });

    return await this.tokenSessionService.createSessionAndGenerateTokens(
      finalUser!,
    );
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  /**
   * Asynchronously evaluates device fingerprints and dispatches security alerts if unknown.
   *
   * @internal
   */
  private triggerDeviceAlert(
    userId: number,
    email: string,
    ip?: string,
    userAgent?: string,
  ): void {
    this.deviceService
      .checkAndAlert(userId, 'user', email, ip, userAgent)
      .catch((err: unknown) =>
        this.logger.error(
          `Device check failed for user ${userId}`,
          getErrorStack(err),
        ),
      );
  }
}
