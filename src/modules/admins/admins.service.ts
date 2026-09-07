import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { BanUserDto } from './dto/ban-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';

@Injectable()
export class AdminsService {
  private readonly logger = new Logger(AdminsService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
  ) {}

  /**
   * Bans a user account and immediately terminates all active sessions.
   *
   * @param userId - Target user ID
   * @param dto - Ban reason and optional duration
   */
  async banUser(userId: number, dto: BanUserDto): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    if (user.isBanned) {
      throw new BadRequestException('User is already banned');
    }

    user.isBanned = true;
    user.banReason = dto.reason;
    user.bannedAt = new Date();
    user.bannedUntil = dto.bannedUntil ? new Date(dto.bannedUntil) : null;
    user.refreshTokenHash = null; // Instantly kills their active refresh session

    const updated = await this.usersRepository.save(user);
    this.logger.warn(
      `Admin Action: User ${userId} has been banned. Reason: ${dto.reason}`,
    );
    return updated;
  }

  /**
   * Unbans a user account, restoring their ability to log in.
   *
   * @param userId - Target user ID
   */
  async unbanUser(userId: number): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    if (!user.isBanned) {
      throw new BadRequestException('User is not banned');
    }

    user.isBanned = false;
    user.banReason = null;
    user.bannedAt = null;
    user.bannedUntil = null;

    const updated = await this.usersRepository.save(user);
    this.logger.log(`Admin Action: User ${userId} has been unbanned.`);
    return updated;
  }

  /**
   * Updates the role assignments for a given user.
   * Invalidates refresh tokens so the user is forced to refresh and obtain a new JWT with updated roles.
   *
   * @param userId - Target user ID
   * @param dto - List of Role IDs to apply
   */
  async assignRoles(userId: number, dto: AssignRolesDto): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    if (dto.roleIds.length > 0) {
      const roles = await this.rolesRepository.findBy({ id: In(dto.roleIds) });
      if (roles.length !== dto.roleIds.length) {
        throw new BadRequestException(
          'One or more specified Role IDs do not exist',
        );
      }
      user.roles = roles;
    } else {
      user.roles = []; // Strips all roles
    }

    // Clear refresh tokens so they can't reuse old token claims indefinitely
    user.refreshTokenHash = null;

    const updated = await this.usersRepository.save(user);
    this.logger.log(`Admin Action: Roles updated for User ${userId}`);
    return updated;
  }

  /**
   * Forcibly logs out a user from all devices by invalidating their refresh token hash.
   *
   * @param userId - Target user ID
   */
  async forceLogout(userId: number): Promise<{ message: string }> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    await this.usersRepository.update(userId, { refreshTokenHash: null });
    this.logger.warn(`Admin Action: User ${userId} was forcefully logged out`);
    return { message: `User ${userId} sessions have been terminated` };
  }

  /**
   * Administrative view of all users with search, role filters, and pagination.
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
