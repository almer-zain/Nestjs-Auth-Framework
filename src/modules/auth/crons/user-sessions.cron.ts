import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { UserSession } from '../entities/user-session.entity';

/**
 * Maintenance worker dedicated to pruning dead and revoked sessions from the database.
 */
@Injectable()
export class UserSessionsCron {
  private readonly logger = new Logger(UserSessionsCron.name);

  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
  ) {}

  /**
   * Deletes expired and revoked sessions to keep the user_sessions table fast and lean.
   * Runs every day at 3:00 AM (`0 3 * * *`).
   */
  @Cron('0 3 * * *')
  async pruneDeadSessions(): Promise<void> {
    const result = await this.sessionRepo
      .createQueryBuilder()
      .delete()
      .from(UserSession)
      .where('expiresAt < :now OR isRevoked = :isRevoked', {
        now: new Date(),
        isRevoked: true,
      })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(
        `Session Maintenance: Pruned ${result.affected} expired/revoked session(s).`,
      );
    }
  }
}
