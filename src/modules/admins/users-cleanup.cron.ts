import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { User } from '../users/entities/user.entity';

@Injectable()
export class UsersCleanupCron {
  private readonly logger = new Logger(UsersCleanupCron.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Cron('0 0 * * *') // Midnight daily
  async hardScrubExpiredAccounts(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Find accounts soft-deleted more than 30 days ago
    const expiredUsers = await this.userRepo.find({
      where: { deletedAt: LessThan(thirtyDaysAgo) },
      withDeleted: true,
    });

    if (expiredUsers.length === 0) return;

    for (const user of expiredUsers) {
      // PII Scrubbing
      user.email = `deleted-${user.id}@anonymized.local`;
      user.username = `deleted_${user.id}`;
      user.displayName = 'Anonymized User';
      user.password = 'SCRUBBED';
      user.twoFactorSecret = null;
      user.refreshTokenHash = null;
      user.passwordResetCode = null;

      await this.userRepo.save(user);
    }

    this.logger.log(
      `GDPR Scrubbing: Anonymized ${expiredUsers.length} expired accounts.`,
    );
  }
}
