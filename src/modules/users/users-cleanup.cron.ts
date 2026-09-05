import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { LessThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class UsersCleanupCron {
  private readonly logger = new Logger(UsersCleanupCron.name);
  constructor(@InjectRepository(User) private userRepo: Repository<User>) {}

  /**
   * Runs every night at midnight.
   * Scrubs PII for accounts that have been soft-deleted for more than 30 days.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async hardScrubExpiredAccounts() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Find accounts soft-deleted more than 30 days ago
    const expiredUsers = await this.userRepo.find({
      where: { deletedAt: LessThan(thirtyDaysAgo) },
      withDeleted: true,
    });

    for (const user of expiredUsers) {
      // Scrub the user data
      user.email = `deleted-${user.id}@anonymized.local`;
      user.username = `deleted_${user.id}`;
      user.displayName = 'Anonymized User';
      user.password = 'SCRUBBED';

      await this.userRepo.save(user);
    }

    if (expiredUsers.length > 0) {
      this.logger.log(
        `Cleanup: Scrubbed PII for ${expiredUsers.length} accounts older than 30 days`,
      );
    }
  }
}
