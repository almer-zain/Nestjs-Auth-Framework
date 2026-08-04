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
    const existing = await this.usersRepository.findOne({
      where: [{ email: dto.email }, { username: dto.username }],
    });

    if (existing) {
      this.logger.warn(
        `Registration attempt failed: Identity conflict for ${dto.email}`,
      );
      throw new ConflictException(
        'User with this email or username already exists',
      );
    }

    const newUser = this.usersRepository.create(dto);
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
      relations: ['roles'], // Ensures roles are included in the list
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
   * @returns The user entity including roles
   * @throws NotFoundException if user does not exist
   */
  async findOne(id: number): Promise<User> {
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

    const user = await this.findOne(id);
    const isAdmin = AccessControlUtil.isAdmin(currentUser);
    if (!isAdmin) {
      delete dto.roleIds; // Prevents regular users from assigning roles to themselves!
    }

    if (dto.password) {
      user.password = await bcrypt.hash(dto.password, 10);
      delete dto.password; // Remove raw password from dto so Object.assign doesn't overwrite hashed password
    }

    if (isAdmin && dto.roleIds) {
      if (dto.roleIds.length > 0) {
        user.roles = await this.rolesRepository.findBy({ id: In(dto.roleIds) });
      } else {
        user.roles = []; // Clear roles if empty array provided
      }
      delete dto.roleIds;
    }

    if (dto.email || dto.username) {
      const conflict = await this.usersRepository.findOne({
        where: [
          { ...(dto.email && { email: dto.email }), id: Not(id) },
          { ...(dto.username && { username: dto.username }), id: Not(id) },
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

    Object.assign(user, dto);

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

    // Mark as soft-deleted (sets deletedAt timestamp)
    await this.usersRepository.softRemove(user);

    this.logger.warn(`User account marked for soft-deletion: ID ${id}`);
  }

  /**
   * Restores a soft-deleted user during the 30-day grace period.
   *
   * @param id - Target user ID
   * @returns The restored User entity
   * @throws NotFoundException if user doesn't exist
   * @throws ConflictException if user is not deleted
   */
  async restore(id: number): Promise<User> {
    // Fetch user including soft-deleted records (withDeleted: true)
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

    // Recover the record (clears deletedAt timestamp)
    await this.usersRepository.recover(user);

    this.logger.log(`User account restored successfully: ID ${id}`);
    return user;
  }
}
