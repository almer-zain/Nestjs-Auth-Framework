import {
  Injectable,
  Inject,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';

import { User } from '../../users/entities/user.entity';
import { UserSession } from '../entities/user-session.entity';
import { AccountWithRoles } from '../../roles/entities/role.entity';
import { AuthCryptoUtil } from '../utils/auth-crypto.util';
import jwtConfig from 'src/config/namespaces/jwt.config';
import { AuthTokens, RefreshTokenPayload } from '../types/auth.types';

/**
 * Session & Token Lifecycle Service.
 *
 * Coordinates multi-device session persistence, Access/Refresh JWT generation,
 * Refresh Token Rotation (RTR), token-theft detection, and session revocation.
 */
@Injectable()
export class TokenSessionService {
  private readonly logger = new Logger(TokenSessionService.name);

  // Session Duration Configuration
  private static readonly SESSION_EXPIRY_DAYS: number = 7;

  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConf: ConfigType<typeof jwtConfig>,
  ) {}

  /**
   * Creates a dedicated database session record and generates an initial JWT pair.
   *
   * @param account - Authenticated user entity
   * @param ip - Remote client IP address
   * @param userAgent - Client browser/device identifier
   * @returns Signed Access and Refresh token pair
   */
  async createSessionAndGenerateTokens(
    account: User,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const sessionExpiry = new Date(
      Date.now() +
        TokenSessionService.SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    // 1. Allocate unique session UUID
    const session = this.sessionRepository.create({
      userId: account.id,
      ipAddress: ip || '127.0.0.1',
      userAgent: userAgent || 'Unknown Device',
      expiresAt: sessionExpiry,
      refreshTokenHash: 'pending',
    });

    const savedSession = await this.sessionRepository.save(session);

    // 2. Generate token pair linked to the session UUID
    const tokens = await this.signTokenPair(account, savedSession.id);

    // 3. Persist SHA-256 digest of the issued refresh token
    savedSession.refreshTokenHash = AuthCryptoUtil.hashDigest(
      tokens.refreshToken,
    );
    await this.sessionRepository.save(savedSession);

    return tokens;
  }

  /**
   * Validates an incoming refresh token, detects token reuse/theft, and rotates token pairs.
   *
   * @param refreshToken - Raw incoming JWT refresh token
   * @param ip - Remote client IP address
   * @param userAgent - Client browser/device identifier
   * @returns Rotated Access and Refresh token pair
   * @throws UnauthorizedException - If token is expired, invalid, revoked, or reused
   */
  async refreshTokens(
    refreshToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: this.jwtConf.refreshSecret },
      );
    } catch {
      throw new UnauthorizedException(
        'Refresh token is invalid or has expired',
      );
    }

    const session = await this.sessionRepository.findOne({
      where: { id: payload.sid, userId: payload.sub },
      relations: ['user', 'user.roles', 'user.roles.permissions'],
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session has expired or been revoked');
    }

    if (session.user.isBanned) {
      throw new UnauthorizedException('Account has been suspended');
    }

    // SHA-256 verification against stored hash
    const incomingDigest = AuthCryptoUtil.hashDigest(refreshToken);
    if (session.refreshTokenHash !== incomingDigest) {
      // REUSE DETECTED: Immediately invalidate session to prevent replay attacks
      await this.sessionRepository.update(session.id, { isRevoked: true });
      this.logger.error(
        `Critical Security Alert: Token reuse detected on session ${session.id}. Session revoked.`,
      );
      throw new UnauthorizedException(
        'Token reuse detected. Session has been terminated.',
      );
    }

    return await this.rotateSessionTokens(session, session.user, ip, userAgent);
  }

  /**
   * Issues new tokens for an active session and updates metadata and hash digest.
   *
   * @param session - Target database session entity
   * @param user - Target user entity
   * @param ip - Client IP address
   * @param userAgent - Client User-Agent string
   * @returns Rotated token pair
   * @internal
   */
  private async rotateSessionTokens(
    session: UserSession,
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const tokens = await this.signTokenPair(user, session.id);

    session.refreshTokenHash = AuthCryptoUtil.hashDigest(tokens.refreshToken);
    if (ip) session.ipAddress = ip;
    if (userAgent) session.userAgent = userAgent;
    session.lastActiveAt = new Date();

    await this.sessionRepository.save(session);
    return tokens;
  }

  /**
   * Signs Access and Refresh JWT payloads containing user identity, roles, and permissions.
   *
   * @param account - Target user entity
   * @param sessionId - Bound unique session ID
   * @returns Signed Access and Refresh token strings
   * @internal
   */
  private async signTokenPair(
    account: User,
    sessionId: string,
  ): Promise<AuthTokens> {
    const accountWithRoles = account as unknown as AccountWithRoles;

    const roleNames: string[] =
      accountWithRoles.roles?.map((r) => r.name).filter(Boolean) ?? [];

    const permissions: string[] =
      accountWithRoles.roles
        ?.flatMap((r) => r.permissions ?? [])
        .map((p) => p?.name)
        .filter((name): name is string => Boolean(name)) ?? [];

    const accessToken = await this.jwtService.signAsync(
      {
        sub: account.id,
        email: account.email,
        roles: Array.from(new Set(roleNames)),
        permissions: Array.from(new Set(permissions)),
      },
      {
        secret: this.jwtConf.accessSecret,
        expiresIn: this.jwtConf.accessExpiry,
      } as JwtSignOptions,
    );

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: account.id,
        sid: sessionId,
      } satisfies RefreshTokenPayload,
      {
        secret: this.jwtConf.refreshSecret,
        expiresIn: this.jwtConf.refreshExpiry,
      } as JwtSignOptions,
    );

    return { accessToken, refreshToken };
  }

  /**
   * Retrieves all non-revoked active device sessions for a given user.
   *
   * @param userId - Target user identifier
   * @returns Array of active session records
   */
  async listUserSessions(userId: number): Promise<UserSession[]> {
    return await this.sessionRepository.find({
      where: { userId, isRevoked: false },
      select: ['id', 'ipAddress', 'userAgent', 'lastActiveAt', 'createdAt'],
      order: { lastActiveAt: 'DESC' },
    });
  }

  /**
   * Remotely revokes a single session by marking it inactive.
   *
   * @param userId - Target user identifier
   * @param sessionId - Unique session ID to revoke
   * @throws NotFoundException - If the target session does not exist or was already revoked
   */
  async revokeSession(userId: number, sessionId: string): Promise<void> {
    const result = await this.sessionRepository.update(
      { id: sessionId, userId },
      { isRevoked: true },
    );

    if (!result.affected) {
      throw new NotFoundException('Session not found or already revoked');
    }
  }

  /**
   * Terminates the current device session by deleting the session record.
   *
   * @param refreshToken - Raw JWT refresh token presented by the client
   */
  async logoutSession(refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: this.jwtConf.refreshSecret },
      );
      await this.sessionRepository.delete({ id: payload.sid });
    } catch {
      // Silently discard errors for malformed or already-expired tokens
    }
  }

  /**
   * Globally removes all active device sessions for a user (Emergency/Password Reset Purge).
   *
   * @param userId - Target user identifier
   */
  async logoutAllSessions(userId: number): Promise<void> {
    await this.sessionRepository.delete({ userId });
    this.logger.warn(
      `Security: Global session purge executed for user ID ${userId}`,
    );
  }
}
