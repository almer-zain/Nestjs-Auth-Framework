import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

import { User } from '../../users/entities/user.entity';
import { AuthCryptoUtil } from '../utils/auth-crypto.util';
import jwtConfig from 'src/config/namespaces/jwt.config';
import {
  GeneratedTwoFactorSecret,
  EnableTwoFactorResult,
  MfaTicketPayload,
} from '../types/auth.types';

/**
 * Two-Factor Authentication Service.
 *
 * Coordinates TOTP secret generation, QR code provisioning, two-factor activation,
 * intermediate challenge tickets, and single-use emergency recovery codes.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  // Security Thresholds
  private static readonly RECOVERY_CODE_COUNT: number = 8;
  private static readonly MFA_TICKET_EXPIRY: string = '3m';

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConf: ConfigType<typeof jwtConfig>,
  ) {}

  /**
   * Issues an intermediate 3-minute JWT challenge ticket for users with 2FA enabled.
   *
   * @param userId - Target user identifier
   * @returns Signed intermediate MFA ticket string
   */
  async generateTicket(userId: number): Promise<string> {
    return await this.jwtService.signAsync(
      {
        sub: userId,
        purpose: 'mfa_validation',
      } satisfies MfaTicketPayload,
      {
        secret: this.jwtConf.accessSecret,
        expiresIn: TwoFactorService.MFA_TICKET_EXPIRY,
      } as JwtSignOptions,
    );
  }

  /**
   * Validates the intermediate MFA ticket and resolves the target user identifier.
   *
   * @param ticket - Intermediate JWT challenge ticket
   * @returns Resolved user ID from payload
   * @throws UnauthorizedException - If ticket is expired, malformed, or has an invalid purpose
   */
  async verifyTicket(ticket: string): Promise<number> {
    try {
      const payload = await this.jwtService.verifyAsync<MfaTicketPayload>(
        ticket,
        { secret: this.jwtConf.accessSecret },
      );

      if (payload.purpose !== 'mfa_validation') {
        throw new Error('Invalid ticket purpose');
      }

      return payload.sub;
    } catch {
      throw new UnauthorizedException(
        'MFA verification ticket has expired or is invalid',
      );
    }
  }

  /**
   * Generates a new Base32 TOTP secret and QR code URI for 2FA onboarding.
   *
   * @param userId - Target user identifier
   * @returns Base32 secret, Base64 QR code image, and standard otpauth URI
   * @throws BadRequestException - If user does not exist
   */
  async generateSecret(userId: number): Promise<GeneratedTwoFactorSecret> {
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

    // Save pending secret without enabling 2FA until confirmed
    await this.userRepository.update(userId, {
      twoFactorSecret: secret,
      isTwoFactorEnabled: false,
    });

    return { secret, qrCode, uri };
  }

  /**
   * Verifies initial TOTP code, enables 2FA, and generates single-use backup codes.
   *
   * @param userId - Target user identifier
   * @param token - 6-digit verification code
   * @returns Confirmation message and unhashed recovery codes
   * @throws BadRequestException - If setup was not initialized or token is invalid
   */
  async enable(userId: number, token: string): Promise<EnableTwoFactorResult> {
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
      token,
    });

    if (!isValid) {
      throw new BadRequestException(
        'Invalid verification code. Two-factor activation aborted.',
      );
    }

    // Generate 8 single-use emergency recovery codes (Format: XXXX-XXXX)
    const rawRecoveryCodes: string[] = [];
    const hashedRecoveryCodes: string[] = [];

    for (let i = 0; i < TwoFactorService.RECOVERY_CODE_COUNT; i++) {
      const partA = crypto.randomBytes(2).toString('hex').toUpperCase();
      const partB = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = `${partA}-${partB}`;

      rawRecoveryCodes.push(code);
      hashedRecoveryCodes.push(
        AuthCryptoUtil.hashDigest(code.replace('-', '')),
      );
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
   * Validates a TOTP code or emergency recovery code against the user's records.
   *
   * @param account - User entity containing 2FA secret and hashed recovery codes
   * @param token - 6-digit TOTP code or plaintext recovery code
   * @throws UnauthorizedException - If token/recovery code is invalid
   */
  async validateCodeOrRecovery(account: User, token: string): Promise<void> {
    let isCodeValid = false;
    const sanitizedToken = token.trim().replace('-', '');

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
      isCodeValid = AuthCryptoUtil.parseVerifyResult(rawResult);
    }

    // 2. Fallback: Validate against single-use recovery codes
    if (!isCodeValid && account.twoFactorRecoveryCodes) {
      const hashedInput = AuthCryptoUtil.hashDigest(
        sanitizedToken.toUpperCase(),
      );
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
  }
}
