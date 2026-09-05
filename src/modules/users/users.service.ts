import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, In, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { AccessControlUtil } from 'src/utils/access-control.util';
import { JwtPayload } from 'src/common/types/jwt-types';
import { Role } from '../roles/entities/role.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
  ) {}

  /**
   * Creates a new user record.
   * Validates uniqueness of email and username before instantiation.
   *
   * @param dto - User registration data
   * @returns The persisted user entity
   * @throws ConflictException if email or username is already in use
   */
  async create(dto: CreateUserDto): Promise<User> {
    const { password, roleIds, usernameDisplay, ...rest } = dto;

    const existing = await this.usersRepository.findOne({
      where: [{ email: rest.email }, { username: rest.username }],
    });

    if (existing) {
      this.logger.warn(
        `Registration attempt failed: Identity conflict for ${rest.email}`,
      );
      throw new ConflictException(
        'User with this email or username already exists',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const roles = roleIds ? roleIds.map((id) => ({ id }) as Role) : [];

    const newUser = this.usersRepository.create({
      ...rest,
      displayName: usernameDisplay,
      password: hashedPassword,
      roles,
    });

    const savedUser = await this.usersRepository.save(newUser);
    this.logger.log(`User created successfully: ID ${savedUser.id}`);
    return savedUser;
  }

  /**
   * Retrieves a paginated list of users.
   *
   * @param query - Pagination and limit parameters
   * @returns Paginated result set with metadata
   */
  async findAll(query: PaginationQueryDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await this.usersRepository.findAndCount({
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['roles'],
    });

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

  /**
   * Finds a single user by primary key.
   *
   * @param id - The unique identifier of the user
   * @param currentUser - Current authenticated user
   * @returns The user entity including roles
   * @throws NotFoundException if user does not exist
   */
  async findOne(id: number, currentUser?: JwtPayload): Promise<User> {
    if (currentUser) {
      AccessControlUtil.checkAdminOrOwner(
        currentUser,
        id,
        'You are not authorized to view this user profile',
      );
    }

    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['roles'],
    });

    if (!user) {
      this.logger.error(`Read operation failed: User ID ${id} not found`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * Updates user profile data.
   * Performs a conflict check if sensitive identifiers (email/username) are changed.
   *
   * @param id - Target user ID
   * @param dto - Partial update data
   * @param currentUser - Current authenticated user
   * @returns The updated user entity
   */
  async update(
    id: number,
    dto: UpdateUserDto,
    currentUser: JwtPayload,
  ): Promise<User> {
    AccessControlUtil.checkAdminOrOwner(
      currentUser,
      id,
      'You are not authorized to update this user profile',
    );

    const isSuperAdmin = AccessControlUtil.isAdmin(currentUser);

    if (!isSuperAdmin) {
      delete dto.roleIds;
    }

    const { password, roleIds, usernameDisplay, ...rest } = dto;
    const user = await this.findOne(id);

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    if (usernameDisplay) {
      user.displayName = usernameDisplay;
    }

    if (isSuperAdmin && roleIds) {
      if (roleIds.length > 0) {
        user.roles = await this.rolesRepository.findBy({ id: In(roleIds) });
      } else {
        user.roles = [];
      }
    }

    if (rest.email || rest.username) {
      const conflict = await this.usersRepository.findOne({
        where: [
          { ...(rest.email && { email: rest.email }), id: Not(id) },
          { ...(rest.username && { username: rest.username }), id: Not(id) },
        ],
      });

      if (conflict) {
        this.logger.warn(
          `Update conflict: User ${id} attempted to use taken credentials`,
        );
        throw new ConflictException(
          'Email or Username already taken by another user',
        );
      }
    }

    Object.assign(user, rest);

    const updated = await this.usersRepository.save(user);
    this.logger.log(`User updated: ID ${id}`);
    return updated;
  }

  /**
   * Performs a privacy-compliant soft delete.
   * Scrubs personally identifiable information (PII) before marking the record as deleted.
   *
   * @param id - Target user ID
   * @throws NotFoundException if user does not exist
   */
  async remove(id: number): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.softRemove(user);
    this.logger.warn(`User account marked for soft-deletion: ID ${id}`);
  }

  /**
   * Restores a soft-deleted user.
   *
   * @param id - Target user ID
   * @returns The restored User entity
   * @throws NotFoundException if user doesn't exist
   * @throws ConflictException if user is not deleted
   */
  async restore(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!user) {
      this.logger.error(`Restore failed: User ID ${id} not found`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (!user.deletedAt) {
      throw new ConflictException(`User ID ${id} is not deleted`);
    }

    await this.usersRepository.recover(user);
    this.logger.log(`User account restored successfully: ID ${id}`);
    return user;
  }
}
