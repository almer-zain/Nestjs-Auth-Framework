// src/modules/auth/strategies/jwt-access.strategy.ts
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import jwtConfig from '../namespaces/jwt.config';
import { JwtPayload } from 'src/common/types/jwt-types';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(jwtConfig.KEY) jwtConf: ConfigType<typeof jwtConfig>) {
    const jwtOptions: StrategyOptions & { clockTolerance: number } = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConf.accessSecret as string,
      clockTolerance: 30,
    };
    super(jwtOptions);
  }

  validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      type: payload.type,
      roles: payload.roles ?? [],
      permissions: payload.permissions || [],
    };
  }
}
