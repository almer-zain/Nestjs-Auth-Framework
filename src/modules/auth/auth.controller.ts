import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  ClassSerializerInterceptor,
  Ip,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';

@ApiTags('Authentication')
@Controller('auth')
@UseInterceptors(ClassSerializerInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new standard user' })
  register(@Body() data: RegisterDto) {
    return this.authService.register(data);
  }

  @Post('login/admin')
  @ApiOperation({ summary: 'Authenticate administrative account' })
  adminLogin(
    @Body() data: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.authService.login({ ...data, ip, userAgent: ua }, 'admin');
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate standard user account' })
  userLogin(
    @Body() data: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.authService.login({ ...data, ip, userAgent: ua }, 'user');
  }

  @Post('2fa/generate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate 2FA setup and return QR code' })
  generate2FA(@Body('userId') userId: number) {
    return this.authService.generate2FASecret(userId);
  }

  @Post('2fa/verify')
  @ApiOperation({ summary: 'Validate TOTP token and finalize login' })
  verify2FA(
    @Body() data: Verify2FADto,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
  ) {
    return this.authService.verify2FA(data, ip, ua);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Trigger password recovery email' })
  forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Apply new password using recovery token' })
  resetPassword(@Body() data: ResetPasswordDto) {
    return this.authService.resetPassword(data);
  }
}
