import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { BanUserDto } from './dto/ban-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { type Cache, CACHE_MANAGER } from '@nestjs/cache-manager';

/**
 * Administrative Moderation and Operations Service.
 *
 * Provides privileged capabilities including account suspension, role/permission reassignment,
 * forced multi-device session invalidation, and paginated user moderation filtering.
 */
@Injectable()
export class AdminsService {
  private readonly logger = new Logger(AdminsService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Suspends a user account and immediately terminates all active device sessions.
   *
   * @param userId - Unique database identifier of the target user
   * @param dto - Moderation payload containing ban reason and optional expiration date
   * @returns The updated User entity reflecting the active suspension state
   *
   * @throws NotFoundException - If the target user ID does not exist in the database
   * @throws BadRequestException - If the target user account is already in a suspended state
   *
   * @remarks
   * Side Effects:
   * - Sets `isBanned = true` and records timestamp and reason.
   * - Deletes all active session records from `user_sessions`, instantly invalidating all refresh tokens.
   */
  async banUser(userId: number, dto: BanUserDto): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (user.isBanned) {
      throw new BadRequestException('User account is already suspended');
    }

    user.isBanned = true;
    user.banReason = dto.reason;
    user.bannedAt = new Date();
    user.bannedUntil = dto.bannedUntil ? new Date(dto.bannedUntil) : null;

    // Persist moderation state
    const updated = await this.usersRepository.save(user);

    // Terminate all active device sessions across all platforms immediately
    await this.sessionRepository.delete({ userId });

    const banTtlMs = dto.bannedUntil
      ? new Date(dto.bannedUntil).getTime() - Date.now()
      : 30 * 24 * 60 * 60 * 1000; // 30 days default for permanent ban

    if (banTtlMs > 0) {
      await this.cacheManager.set(`banned_user:${userId}`, true, banTtlMs);
    }

    this.logger.warn(
      `Moderation Incident: User ${userId} banned by admin. Reason: "${dto.reason}". All active sessions purged.`,
    );

    this.logger.warn(`User ${userId} banned.`);

    return updated;
  }

  /**
   * Reinstates a suspended user account, restoring their ability to authenticate.
   *
   * @param userId - Unique database identifier of the target user
   * @returns The updated User entity with suspension flags cleared
   *
   * @throws NotFoundException - If the user does not exist
   * @throws BadRequestException - If the user is not currently banned
   */
  async unbanUser(userId: number): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.isBanned) {
      throw new BadRequestException('User account is not currently suspended');
    }

    user.isBanned = false;
    user.banReason = null;
    user.bannedAt = null;
    user.bannedUntil = null;

    const updated = await this.usersRepository.save(user);

    await this.cacheManager.del(`banned_user:${userId}`);

    this.logger.log(
      `User ${userId} unbanned and removed from Redis ban cache.`,
    );

    this.logger.log(`Moderation Action: User ${userId} has been unbanned.`);
    return updated;
  }

  /**
   * Modifies security role assignments for a user and purges active sessions.
   *
   * @param userId - Target user identifier
   * @param dto - Array of validated Role IDs to attach to the account
   * @returns The updated User entity with fresh role relations loaded
   *
   * @throws NotFoundException - If the user does not exist
   * @throws BadRequestException - If one or more supplied Role IDs are invalid
   *
   * @remarks
   * Security Protocol:
   * Reassigning roles purges all existing `user_sessions`. This forces the user to
   * re-authenticate, ensuring outdated JWT claims cannot be used with stale permissions.
   */
  async assignRoles(userId: number, dto: AssignRolesDto): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (dto.roleIds.length > 0) {
      const roles = await this.rolesRepository.findBy({ id: In(dto.roleIds) });
      if (roles.length !== dto.roleIds.length) {
        throw new BadRequestException(
          'One or more specified Role IDs do not exist in the system',
        );
      }
      user.roles = roles;
    } else {
      user.roles = []; // Clear all assigned roles
    }

    const updated = await this.usersRepository.save(user);

    // Invalidate sessions so old JWT claims cannot linger
    await this.sessionRepository.delete({ userId });

    this.logger.log(
      `Access Control: Roles updated for User ${userId}. Sessions reset to enforce new claims.`,
    );

    return updated;
  }

  /**
   * Forcibly logs out a user from all devices by purging their session records.
   *
   * @param userId - Target user identifier
   * @returns Success confirmation payload
   *
   * @throws NotFoundException - If the target user does not exist
   */
  async forceLogout(userId: number): Promise<{ message: string }> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    await this.sessionRepository.delete({ userId });

    this.logger.warn(
      `Security Action: Administrative force logout executed for User ${userId}.`,
    );

    return {
      message: `All active sessions for User ${userId} have been terminated`,
    };
  }

  /**
   * Retrieves a paginated list of users with dynamic search and moderation filters.
   *
   * @param query - Filter criteria (search keyword, ban status, page, limit)
   * @returns Paginated result set with metadata (total items, pages, current page)
   */
  async listUsers(
    query: PaginationQueryDto & { search?: string; isBanned?: boolean },
  ) {
    const { page = 1, limit = 10, search, isBanned } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .skip(skip)
      .take(limit)
      .orderBy('user.id', 'DESC');

    if (search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.username ILIKE :search OR user.displayName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (isBanned !== undefined) {
      queryBuilder.andWhere('user.isBanned = :isBanned', { isBanned });
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      data: items,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }
}
