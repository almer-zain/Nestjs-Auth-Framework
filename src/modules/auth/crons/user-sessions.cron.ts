import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserSession } from '../entities/user-session.entity';
import { getErrorStack } from 'src/utils/error.util';

/**
 * Scheduled worker responsible for database sanitation of expired and revoked user sessions.
 */
@Injectable()
export class UserSessionsCleanupCron {
  private readonly logger = new Logger(UserSessionsCleanupCron.name);

  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
  ) {}

  /**
   * Daily maintenance task that purges dead sessions from the `user_sessions` table.
   *
   * @remarks
   * Schedule: Runs every day at 3:00 AM (`0 3 * * *`).
   * Targets: Any session where `expiresAt < NOW()` OR `isRevoked = true`.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneExpiredSessions(): Promise<void> {
    try {
      const result = await this.sessionRepository
        .createQueryBuilder()
        .delete()
        .from(UserSession)
        .where('expiresAt < :now OR isRevoked = :isRevoked', {
          now: new Date(),
          isRevoked: true,
        })
        .execute();

      const deletedCount = result.affected ?? 0;

      if (deletedCount > 0) {
        this.logger.log(
          `Session Pruning: Successfully deleted ${deletedCount} dead session(s).`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        'Session Pruning Failed: Unable to clean up expired sessions.',
        getErrorStack(error),
      );
    }
  }
}
