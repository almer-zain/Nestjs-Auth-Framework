import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

import { User } from '../../users/entities/user.entity';
import { MailService } from '../../mail/mail.service';
import { AuthCryptoUtil } from '../utils/auth-crypto.util';
import type { VerificationResult } from '../types/auth.types';

/**
 * Email Verification Lifecycle Service.
 *
 * Handles generation of cryptographically secure single-use email tokens,
 * token consumption, validation expiry, and dispatching verification emails.
 */
@Injectable()
export class EmailVerifyService {
  private readonly logger = new Logger(EmailVerifyService.name);

  // Verification link validity: 24 Hours in Milliseconds
  private static readonly TOKEN_EXPIRY_MS: number = 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generates a single-use 64-character token, hashes it for database persistence,
   * and dispatches the verification link to the target user email.
   *
   * @param user - Target user entity
   */
  async sendVerificationEmail(user: User): Promise<void> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = AuthCryptoUtil.hashDigest(rawToken);
    const expires = new Date(Date.now() + EmailVerifyService.TOKEN_EXPIRY_MS);

    await this.userRepository.update(user.id, {
      emailVerificationToken: hashedToken,
      emailVerificationExpires: expires,
    });

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const verifyUrl = `${frontendUrl}/verify-email?token=${rawToken}`;

    await this.mailService.sendVerificationEmail(user.email, verifyUrl);
    this.logger.log(`Verification email dispatched to: ${user.email}`);
  }

  /**
   * Consumes a verification token and activates the user account.
   *
   * @param rawToken - Plaintext verification token from query param or request body
   * @returns Confirmation message
   * @throws BadRequestException - If the token is invalid or expired
   */
  async verifyEmail(rawToken: string): Promise<VerificationResult> {
    const hashedToken = AuthCryptoUtil.hashDigest(rawToken);

    const user = await this.userRepository.findOne({
      where: { emailVerificationToken: hashedToken },
      select: ['id', 'email', 'isEmailVerified', 'emailVerificationExpires'],
    });

    if (
      !user ||
      !user.emailVerificationExpires ||
      user.emailVerificationExpires < new Date()
    ) {
      throw new BadRequestException(
        'Verification token is invalid or has expired',
      );
    }

    await this.userRepository.update(user.id, {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });

    this.logger.log(`Email verified successfully for user ID: ${user.id}`);
    return {
      message:
        'Email verified successfully. You can now use all platform features.',
    };
  }

  /**
   * Dispatches a fresh verification link if the account exists and remains unverified.
   *
   * @param email - Target account email address
   * @returns Generic confirmation message to prevent account enumeration
   */
  async resendVerificationEmail(email: string): Promise<VerificationResult> {
    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'isEmailVerified'],
    });

    // Uniform response to prevent account enumeration
    if (!user || user.isEmailVerified) {
      return {
        message:
          'If the account exists and is unverified, a verification link has been dispatched.',
      };
    }

    await this.sendVerificationEmail(user);
    return {
      message:
        'If the account exists and is unverified, a verification link has been dispatched.',
    };
  }
}
