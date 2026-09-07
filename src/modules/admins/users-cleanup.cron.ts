import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { User } from '../users/entities/user.entity';

/**
 * Scheduled GDPR and Data Retention Cleanup Worker.
 *
 * Runs background maintenance jobs to permanently anonymize and scrub Personally
 * Identifiable Information (PII) from accounts that have been soft-deleted for over 30 days.
 */
@Injectable()
export class UsersCleanupCron {
  private readonly logger = new Logger(UsersCleanupCron.name);

  // Retention Threshold: 30 Days in Milliseconds
  private static readonly RETENTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Scheduled cron job that scrubs PII and security credentials from soft-deleted accounts.
   *
   * @remarks
   * Schedule: Runs every day at midnight (`0 0 * * *`).
   *
   * Security & Privacy Measures:
   * - Replaces email with a dead-end local domain (`deleted-{id}@anonymized.local`).
   * - Replaces username and display name with non-identifying values.
   * - Overwrites passwords, 2FA secrets, backup codes, and reset tokens with `null` or placeholder values.
   */
  @Cron('0 0 * * *')
  async hardScrubExpiredAccounts(): Promise<void> {
    const cutoffDate = new Date(
      Date.now() - UsersCleanupCron.RETENTION_PERIOD_MS,
    );

    // Locate accounts soft-deleted prior to the retention cutoff date
    const expiredUsers = await this.userRepo.find({
      where: { deletedAt: LessThan(cutoffDate) },
      withDeleted: true,
    });

    if (expiredUsers.length === 0) {
      return;
    }

    for (const user of expiredUsers) {
      // Scrub Personally Identifiable Information (PII)
      user.email = `deleted-${user.id}@anonymized.local`;
      user.username = `deleted_${user.id}`;
      user.displayName = 'Anonymized User';
      user.password = 'SCRUBBED';

      // Purge all cryptographic secrets and recovery tokens
      user.twoFactorSecret = null;
      user.twoFactorRecoveryCodes = null;
      user.passwordResetCode = null;
      user.passwordResetExpires = null;

      await this.userRepo.save(user);
    }

    this.logger.log(
      `GDPR Retention Maintenance: Anonymized ${expiredUsers.length} soft-deleted account(s).`,
    );
  }
}
