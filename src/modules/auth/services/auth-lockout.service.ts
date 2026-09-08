import {
  Injectable,
  Inject,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * Brute-Force & Account Lockout Protection Service.
 *
 * Implements sliding-window rate limiting backed by Redis cache to protect
 * authentication endpoints against credential stuffing and brute-force attacks.
 */
@Injectable()
export class AuthLockoutService {
  private readonly logger = new Logger(AuthLockoutService.name);

  // Security Thresholds
  private static readonly MAX_FAILED_ATTEMPTS: number = 5;
  private static readonly LOCKOUT_WINDOW_MS: number = 15 * 60 * 1000; // 15 Minutes

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Checks if an email is actively locked out from previous failed attempts.
   *
   * @param email - Target user email address
   * @throws HttpException - If the account is currently locked out (HTTP 429)
   */
  async checkLockoutThreshold(email: string): Promise<void> {
    const isLocked = await this.cacheManager.get<boolean>(`lockout:${email}`);

    if (isLocked) {
      this.logger.warn(
        `Security Shield: Blocked attempt on locked account ${email}`,
      );
      throw new HttpException(
        'Account is temporarily locked due to excessive failed login attempts. Try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Increments the failed login attempt counter and sets the lockout flag if threshold is reached.
   *
   * @param email - Target user email address
   */
  async registerFailedAttempt(email: string): Promise<void> {
    const key = `failed_attempts:${email}`;
    const attempts = ((await this.cacheManager.get<number>(key)) || 0) + 1;

    await this.cacheManager.set(
      key,
      attempts,
      AuthLockoutService.LOCKOUT_WINDOW_MS,
    );

    if (attempts >= AuthLockoutService.MAX_FAILED_ATTEMPTS) {
      await this.cacheManager.set(
        `lockout:${email}`,
        true,
        AuthLockoutService.LOCKOUT_WINDOW_MS,
      );
      await this.cacheManager.del(key);
      this.logger.error(
        `Security Incident: Account ${email} locked out for 15 minutes.`,
      );
    }
  }

  /**
   * Clears active failed attempt counters and lockout records upon successful authentication.
   *
   * @param email - Target user email address
   */
  async clearLockoutHistory(email: string): Promise<void> {
    await this.cacheManager.del(`failed_attempts:${email}`);
    await this.cacheManager.del(`lockout:${email}`);
  }
}
