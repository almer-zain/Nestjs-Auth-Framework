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
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { Enable2FADto } from './dto/enable-2fa.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorator/current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
@UseInterceptors(ClassSerializerInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register new account',
    description:
      'Creates a new user account with hashed credentials and optional Turnstile CAPTCHA validation.',
  })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiBadRequestResponse({
    description: 'Validation failed or email/username already taken',
  })
  register(@Body() data: RegisterDto) {
    return this.authService.register(data);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate account',
    description:
      'Validates credentials. Returns standard tokens OR an `mfaTicket` if 2FA is active on the account.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns access & refresh tokens OR indicates 2FA requirement with an mfaTicket',
    schema: {
      oneOf: [
        {
          example: {
            accessToken: 'eyJhbGciOi...',
            refreshToken: 'eyJhbGciOi...',
          },
        },
        {
          example: {
            mfaRequired: true,
            mfaTicket: 'eyJhbGciOi...',
          },
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async login(
    @Body() data: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    // Passes ip and ua to satisfy ESLint and enable DeviceService tracking
    return await this.authService.login({
      ...data,
      ip,
      userAgent: ua || 'Unknown Device',
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate refresh token',
    description:
      'Issues a new Access & Refresh token pair while invalidating the old refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Tokens rotated successfully' })
  @ApiUnauthorizedResponse({
    description: 'Expired, invalid, or reused refresh token',
  })
  async refreshToken(@Body() data: RefreshTokenDto) {
    return await this.authService.refreshTokens(data.refreshToken);
  }

  @Post('2fa/generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize 2FA setup',
    description:
      'Generates a TOTP secret and returns a QR code data URI. User must be authenticated.',
  })
  @ApiResponse({
    status: 200,
    description: '2FA secret and QR code generated',
    schema: {
      example: {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCode: 'data:image/png;base64,...',
        uri: 'otpauth://totp/MyApp:user@example.com?secret=...',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  generate2FA(@CurrentUser('sub') userId: number) {
    return this.authService.generate2FASecret(userId);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm and activate 2FA',
    description:
      'Verifies the first 6-digit TOTP code to permanently activate 2FA for the authenticated user.',
  })
  @ApiResponse({ status: 200, description: '2FA successfully activated' })
  @ApiBadRequestResponse({
    description: 'Invalid verification code or setup uninitialized',
  })
  enable2FA(@CurrentUser('sub') userId: number, @Body() data: Enable2FADto) {
    return this.authService.enable2FA(userId, data);
  }

  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify 2FA login challenge',
    description:
      'Exchanges the temporary `mfaTicket` and 6-digit TOTP code for active access and refresh tokens.',
  })
  @ApiResponse({
    status: 200,
    description: '2FA validated. Returns access and refresh tokens.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired MFA ticket or incorrect OTP',
  })
  verify2FA(
    @Body() data: Verify2FADto,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.authService.verify2FA(data, ip, ua);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Sends a password recovery link with a cryptographically secure token to the registered email.',
  })
  @ApiResponse({
    status: 200,
    description: 'Recovery email dispatched if address exists',
  })
  forgotPassword(@Body() data: ForgotPasswordDto) {
    return this.authService.forgotPassword(data.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password with token',
    description:
      'Validates the hashed recovery token and applies a new argon2-hashed password.',
  })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiBadRequestResponse({
    description: 'Invalid, malformed, or expired reset token',
  })
  resetPassword(@Body() data: ResetPasswordDto) {
    return this.authService.resetPassword(data);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out user',
    description:
      'Invalidates the stored refresh token hash, blocking future token refresh cycles.',
  })
  @ApiResponse({ status: 200, description: 'Session terminated successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  logout(@CurrentUser('sub') userId: number) {
    return this.authService.logout(userId);
  }
}
