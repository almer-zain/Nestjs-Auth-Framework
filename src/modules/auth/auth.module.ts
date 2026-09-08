import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountDevice } from './entities/account-device.entity';
import { User } from '../users/entities/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { MailerModule } from '@nestjs-modules/mailer';
import { CaptchaService } from './captcha.service';
import { DeviceService } from './device.service';
import { MailService } from '../mail/mail.service';
import { UserSession } from './entities/user-session.entity';
import { TwoFactorService } from './services/two-factor.service';
import { TokenSessionService } from './services/token-session.service';
import { PasswordResetService } from './services/password-reset.service';
import { AuthLockoutService } from './services/auth-lockout.service';
import { EmailVerifyService } from './services/email-verify.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountDevice, User, UserSession]),
    JwtModule.register({}),
    MailerModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    CaptchaService,
    DeviceService,
    MailService,
    TwoFactorService,
    TokenSessionService,
    PasswordResetService,
    AuthLockoutService,
    EmailVerifyService,
  ],
})
export class AuthModule {}
