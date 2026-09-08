import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  ClassSerializerInterceptor,
  Ip,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { Enable2FADto } from './dto/enable-2fa.dto';

import {
  AuthTokens,
  LoginResult,
  GeneratedTwoFactorSecret,
  EnableTwoFactorResult,
} from './types/auth.types';

/**
 * Authentication & Identity Controller.
 *
 * Exposes endpoints for user registration, authentication handshakes,
 * token rotation (RTR), two-factor authentication (TOTP), and password recovery.
 */
@ApiTags('Authentication & Identity')
@Controller('auth')
@UseInterceptors(ClassSerializerInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registers a new account with Argon2id password hashing and optional CAPTCHA verification.
   *
   * @param data - Registration credentials and optional Turnstile token
   * @returns Newly created and persisted User entity
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Provisions a standard account, verifies the Cloudflare Turnstile token (if enabled), and hashes credentials using Argon2id.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User successfully registered.',
    type: User,
  })
  @ApiBadRequestResponse({
    description:
      'Validation failed, CAPTCHA invalid, or email/username already exists.',
  })
  async register(@Body() data: RegisterDto): Promise<User> {
    return await this.authService.register(data);
  }

  /**
   * Authenticates user credentials, evaluates account status, and processes 2FA state.
   *
   * @param data - Login credentials
   * @param ip - Client IP address
   * @param ua - Client User-Agent string
   * @returns Access/Refresh tokens or an intermediate MFA challenge ticket
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate credentials',
    description:
      'Validates credentials and analyzes device fingerprint. Returns standard Access/Refresh tokens OR an `mfaTicket` if 2FA is active.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Authentication successful. Returns token pair or an MFA challenge ticket.',
    schema: {
      oneOf: [
        {
          properties: {
            accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
            refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
          },
        },
        {
          properties: {
            mfaRequired: { type: 'boolean', example: true },
            mfaTicket: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
          },
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials, CAPTCHA failure, or account suspended.',
  })
  async login(
    @Body() data: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ): Promise<LoginResult> {
    return await this.authService.login({
      ...data,
      ip,
      userAgent: ua || 'Unknown Device',
    });
  }

  /**
   * Rotates access and refresh tokens for a specific device session with reuse detection.
   *
   * @param data - Payload containing the active refresh token
   * @param ip - Client IP address
   * @param ua - Client User-Agent string
   * @returns Rotated Access and Refresh token pair
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate session tokens',
    description:
      'Exchanges a valid refresh token for a newly rotated Access & Refresh token pair. Implements automatic token theft detection.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tokens successfully rotated.',
    schema: {
      properties: {
        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
        refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Expired, revoked, or compromised refresh token.',
  })
  async refreshToken(
    @Body() data: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ): Promise<AuthTokens> {
    return await this.authService.refreshTokens(data.refreshToken, ip, ua);
  }

  /**
   * Initializes TOTP-based 2FA setup by generating a secret and QR code URI.
   *
   * @param userId - Target user identifier extracted from JWT payload
   * @returns Generated Base32 secret, QR code image, and otpauth URI
   */
  @Post('2fa/generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize 2FA setup (QR Code)',
    description:
      'Generates a TOTP Base32 secret and returns a QR code data URI. Does NOT activate 2FA until confirmed via `/auth/2fa/enable`.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '2FA secret and QR code successfully generated.',
    schema: {
      properties: {
        secret: { type: 'string', example: 'JBSWY3DPEHPK3PXP' },
        qrCode: {
          type: 'string',
          example: 'data:image/png;base64,iVBORw0KGgo...',
        },
        uri: {
          type: 'string',
          example: 'otpauth://totp/MyApp:user@example.com?secret=...',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid Bearer access token.',
  })
  async generate2FA(
    @CurrentUser('sub') userId: number,
  ): Promise<GeneratedTwoFactorSecret> {
    return await this.authService.generate2FASecret(userId);
  }

  /**
   * Confirms initial TOTP code, enables 2FA, and generates single-use backup recovery codes.
   *
   * @param userId - Target user identifier extracted from JWT payload
   * @param data - Payload containing the 6-digit confirmation code
   * @returns Confirmation message and list of unhashed recovery codes
   */
  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm and activate 2FA',
    description:
      'Verifies the first 6-digit TOTP code against the generated secret to permanently enable 2FA on the account.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Two-factor authentication successfully activated.',
    schema: {
      properties: {
        message: {
          type: 'string',
          example: 'Two-factor authentication enabled successfully',
        },
        recoveryCodes: {
          type: 'array',
          items: { type: 'string' },
          example: ['A1B2-C3D4', 'E5F6-G7H8'],
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid verification code or setup uninitialized.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid Bearer access token.',
  })
  async enable2FA(
    @CurrentUser('sub') userId: number,
    @Body() data: Enable2FADto,
  ): Promise<EnableTwoFactorResult> {
    return await this.authService.enable2FA(userId, data);
  }

  /**
   * Validates an MFA challenge ticket alongside a 6-digit TOTP code or recovery code.
   *
   * @param data - MFA challenge payload containing ticket and token
   * @param ip - Client IP address
   * @param ua - Client User-Agent string
   * @returns Full Access & Refresh session token pair
   */
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify 2FA login challenge',
    description:
      'Exchanges the short-lived `mfaTicket` and a 6-digit TOTP code for full Access & Refresh session tokens.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'MFA challenge verified. Tokens issued.',
    schema: {
      properties: {
        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
        refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired MFA ticket, or incorrect OTP code.',
  })
  @ApiNotFoundResponse({ description: 'User account not found.' })
  async verify2FA(
    @Body() data: Verify2FADto,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ): Promise<AuthTokens> {
    return await this.authService.verify2FA(data, ip, ua);
  }

  /**
   * Generates a single-use password recovery token and dispatches a reset link via email.
   *
   * @param data - Payload containing the target account email
   * @returns Generic confirmation message to prevent user enumeration
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset email',
    description:
      'Generates a SHA-256 hashed recovery token and emails the raw token link. Always returns a 200 OK to prevent account enumeration.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Recovery email dispatched if the address exists.',
    schema: {
      properties: {
        message: {
          type: 'string',
          example: 'If email exists, a reset code was sent',
        },
      },
    },
  })
  async forgotPassword(
    @Body() data: ForgotPasswordDto,
  ): Promise<{ message: string; token?: string; resetUrl?: string }> {
    return await this.authService.forgotPassword(data.email);
  }

  /**
   * Consumes a valid password reset token, updates password, and purges all active sessions.
   *
   * @param data - Recovery payload containing email, token, and new password
   * @returns Password reset confirmation message
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using token',
    description:
      'Validates the recovery token, updates the password using Argon2id, and invalidates ALL active sessions across all devices.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password reset successful. All active sessions invalidated.',
    schema: {
      properties: {
        message: { type: 'string', example: 'Password updated successfully' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid, malformed, or expired password reset token.',
  })
  async resetPassword(
    @Body() data: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return await this.authService.resetPassword(data);
  }

  /**
   * Logs out the current device by revoking and deleting its specific session record.
   *
   * @param data - Payload containing the current active refresh token
   * @returns Logout confirmation message
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out current device',
    description:
      'Invalidates the presented refresh token by removing its device session record from the database.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Device session terminated successfully.',
    schema: {
      properties: {
        message: { type: 'string', example: 'Logged out successfully' },
      },
    },
  })
  async logout(@Body() data: RefreshTokenDto): Promise<{ message: string }> {
    return await this.authService.logoutSession(data.refreshToken);
  }

  /**
   * Terminates all active sessions for the user across all devices (Emergency Logout).
   *
   * @param userId - Target user identifier extracted from JWT payload
   * @returns Global purge confirmation message
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out all devices (Global Logout)',
    description:
      'Terminates all active device sessions for the authenticated user, forcing re-authentication everywhere.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All user sessions terminated.',
    schema: {
      properties: {
        message: {
          type: 'string',
          example: 'All active sessions have been terminated',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid Bearer access token.',
  })
  async logoutAll(
    @CurrentUser('sub') userId: number,
  ): Promise<{ message: string }> {
    return await this.authService.logoutAllSessions(userId);
  }
}
