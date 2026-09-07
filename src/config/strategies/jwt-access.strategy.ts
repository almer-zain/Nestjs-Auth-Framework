// src/modules/auth/strategies/jwt-access.strategy.ts
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import jwtConfig from '../namespaces/jwt.config';
import { JwtPayload } from 'src/common/types/jwt-types';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(jwtConfig.KEY) jwtConf: ConfigType<typeof jwtConfig>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    const jwtOptions: StrategyOptions & { clockTolerance: number } = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConf.accessSecret as string,
      clockTolerance: 30,
    };
    super(jwtOptions);
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const isBanned = (await this.cacheManager.get<boolean>(
      `banned_user:${payload.sub}`,
    )) as boolean;

    if (isBanned) {
      throw new UnauthorizedException(
        'Your account has been suspended by an administrator.',
      );
    }

    return {
      userId: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
      permissions: payload.permissions || [],
    };
  }
}
