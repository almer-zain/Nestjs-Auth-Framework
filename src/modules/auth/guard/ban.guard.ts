import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator';
import { RequestWithUser } from 'src/common/types/jwt-types';

/**
 * Guard that enforces instant account ban enforcement.
 *
 * @remarks
 * Evaluates the authenticated user context against the in-memory Redis ban cache.
 * Executes in `< 0.2ms` without querying the primary SQL database.
 */
@Injectable()
export class BanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Determines if the current request is allowed to proceed.
   *
   * @param context - NestJS execution context
   * @returns `true` if user is in good standing or route is public
   * @throws UnauthorizedException - If the user account is actively banned in Redis
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Bypass public routes (e.g., /auth/login, /auth/register, /health)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // 2. Extract authenticated user context populated by JwtAuthGuard
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // If no user context exists, allow subsequent guards (JwtAuthGuard) to handle 401
    if (!user || !user.sub) {
      return true;
    }

    const userId = user.sub;

    // 3. Fast in-memory Redis check (< 0.2ms)
    const isBanned = await this.cacheManager.get<boolean>(
      `banned_user:${userId}`,
    );

    if (isBanned) {
      throw new UnauthorizedException(
        'Your account has been suspended by an administrator. All access is revoked.',
      );
    }

    return true;
  }
}
