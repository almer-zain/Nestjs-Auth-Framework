import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { type Cache } from 'cache-manager';

@Injectable()
export class CacheInvalidationService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /**
   * Clears cached user permissions when roles/permissions change
   */
  async invalidateUserPermissions(
    userId: number,
    accountType: 'user' | 'admin',
  ): Promise<void> {
    const cacheKey = `permissions:${accountType}:${userId}`;
    await this.cacheManager.del(cacheKey);
  }
}
