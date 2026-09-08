import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import { User } from '../../users/entities/user.entity';
import { MailService } from '../../mail/mail.service';
import { TokenSessionService } from './token-session.service';
import { AuthCryptoUtil } from '../utils/auth-crypto.util';
import { ResetPasswordDto } from '../dto/reset-password.dto';

/**
 * Password Recovery & Reset Service.
 *
 * Handles secure password reset link generation, single-use token storage,
 * credential rotation with Argon2id, and automatic global session invalidation.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly tokenSessionService: TokenSessionService,
  ) {}

  /**
   * Dispatches a single-use password recovery token via email.
   *
   * @param email - Target user email address
   * @returns Generic confirmation response to mitigate user enumeration attacks
   */
  async forgotPassword(
    email: string,
  ): Promise<{ message: string; token?: string; resetUrl?: string }> {
    const account = await this.userRepository.findOneBy({ email });

    // Mitigate user enumeration attacks by returning early with generic message
    if (!account) {
      return {
        message:
          'If the email is registered, a password reset link was dispatched.',
      };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = AuthCryptoUtil.hashDigest(rawToken);
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
   * Verifies the recovery token, applies the new Argon2id password hash, and purges all active sessions.
   *
   * @param data - Password reset payload containing email, token, and new password
   * @returns Confirmation message
   * @throws BadRequestException - If reset token is invalid, missing, or expired
   */
  async resetPassword(data: ResetPasswordDto): Promise<{ message: string }> {
    const hashedToken = AuthCryptoUtil.hashDigest(data.code);
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

    const hashedPassword = await AuthCryptoUtil.hashPassword(data.newPassword);

    // 1. Persist new credentials and clear reset token fields
    await this.userRepository.update(account.id, {
      password: hashedPassword,
      passwordResetCode: null,
      passwordResetExpires: null,
    });

    // 2. Globally invalidate all active sessions for security
    await this.tokenSessionService.logoutAllSessions(account.id);

    this.logger.log(
      `Security: Password reset completed for user ${account.id}. All sessions purged.`,
    );

    return { message: 'Password updated successfully. Please log in again.' };
  }
}
