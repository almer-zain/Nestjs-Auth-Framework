import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountDevice } from './entities/account-device.entity';
import { User } from '../users/entities/user.entity';
import { Admin } from '../admins/entities/admin.entity';
import { JwtModule } from '@nestjs/jwt';
import { MailerModule } from '@nestjs-modules/mailer';
import { CaptchaService } from './captcha.service';
import { DeviceService } from './device.service';
import { MailService } from '../mail/mail.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountDevice, User, Admin]),
    JwtModule.register({}),
    MailerModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, CaptchaService, DeviceService, MailService],
})
export class AuthModule {}
