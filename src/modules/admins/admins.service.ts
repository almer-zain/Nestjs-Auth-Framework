import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Admin } from './entities/admin.entity';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '../roles/entities/role.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import type { JwtPayload } from 'src/common/types/jwt-types';
import { AccessControlUtil } from 'src/utils/access-control.util';

@Injectable()
export class AdminsService {
  private readonly logger = new Logger(AdminsService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminsRepository: Repository<Admin>,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
  ) {}

  /**
   * Provisions a new administrative account.
   * Validates identity uniqueness and hashes credentials before persistence.
   *
   * @param dto - Admin creation data including role assignments
   * @returns The persisted Admin entity
   * @throws ConflictException if email or username is already registered
   */
  async create(dto: CreateAdminDto): Promise<Admin> {
    const { password, roleIds, ...rest } = dto;

    const existing = await this.adminsRepository.findOne({
      where: [{ email: rest.email }, { username: rest.username }],
    });

    if (existing) {
      this.logger.warn(
        `Admin provision failed: Identity conflict for ${rest.email}`,
      );
      throw new ConflictException(
        'Admin with this email or username already exists',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const roles = roleIds ? roleIds.map((id) => ({ id }) as Role) : [];

    const newAdmin = this.adminsRepository.create({
      ...rest,
      password: hashedPassword,
      roles,
    });

    const savedAdmin = await this.adminsRepository.save(newAdmin);
    this.logger.log(`Admin created successfully: ID ${savedAdmin.id}`);
    return savedAdmin;
  }

  /**
   * Retrieves a paginated list of administrators.
   * Includes nested relations for roles and their associated permissions.
   *
   * @param query - Pagination and limit parameters
   * @returns Paginated result set with metadata
   */
  async findAll(query: PaginationQueryDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await this.adminsRepository.findAndCount({
      relations: ['roles', 'roles.permissions'],
      skip,
      take: limit,
      order: { id: 'DESC' },
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
   * Fetches a specific administrator by primary key.
   *
   * @param id - Unique identifier of the admin
   * @param currentUser - Current authenticated user
   * @returns The admin entity with full permission tree
   * @throws NotFoundException if the admin does not exist
   */
  async findOne(id: number, currentUser?: JwtPayload): Promise<Admin> {
    if (currentUser) {
      AccessControlUtil.checkAdminOrOwner(
        currentUser,
        id,
        'You are not authorized to view this admin profile',
      );
    }

    const admin = await this.adminsRepository.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions'],
    });

    if (!admin) {
      this.logger.error(`Read operation failed: Admin ID ${id} not found`);
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }
    return admin;
  }

  /**
   * Updates administrative account details and security roles.
   *
   * @param id - Target admin ID
   * @param dto - Partial update data
   * @param currentUser - Current authenticated user
   * @returns The updated Admin entity
   */
  async update(
    id: number,
    dto: UpdateAdminDto,
    currentUser: JwtPayload,
  ): Promise<Admin> {
    AccessControlUtil.checkAdminOrOwner(
      currentUser,
      id,
      'You are not authorized to update this admin profile',
    );

    const isSuperAdmin = AccessControlUtil.isAdmin(currentUser);

    if (!isSuperAdmin) {
      delete dto.roleIds;
    }

    const { password, roleIds, ...rest } = dto;
    const admin = await this.findOne(id);

    if (password) {
      admin.password = await bcrypt.hash(password, 10);
    }

    if (isSuperAdmin && roleIds) {
      if (roleIds.length > 0) {
        admin.roles = await this.rolesRepository.findBy({ id: In(roleIds) });
      } else {
        admin.roles = []; // Clear roles if empty array passed
      }
    }

    if (rest.email || rest.username) {
      const conflict = await this.adminsRepository.findOne({
        where: [
          { ...(rest.email && { email: rest.email }), id: Not(id) },
          { ...(rest.username && { username: rest.username }), id: Not(id) },
        ],
      });

      if (conflict) {
        this.logger.warn(
          `Update conflict: Admin ${id} attempted to use taken credentials`,
        );
        throw new ConflictException(
          'Email or Username already taken by another admin',
        );
      }
    }

    Object.assign(admin, rest);
    const updated = await this.adminsRepository.save(admin);

    this.logger.log(`Admin updated successfully: ID ${id}`);
    return updated;
  }

  /**
   * Performs a soft delete.
   * Overwrites sensitive identifiers (PII) before marking the record as deleted.
   *
   * @param id - Target admin ID
   * @throws NotFoundException if admin does not exist
   */
  async remove(id: number): Promise<void> {
    const admin = await this.findOne(id);

    await this.adminsRepository.softRemove(admin);

    this.logger.warn(`Admin record scrubbed and soft-deleted: ID ${id}`);
  }

  /**
   * Restores a soft-deleted user during the 30-day grace period.
   *
   * @param id - Target user ID
   * @returns The restored User entity
   * @throws NotFoundException if user doesn't exist
   * @throws ConflictException if user is not deleted
   */
  async restore(id: number): Promise<Admin> {
    // Fetch user including soft-deleted records (withDeleted: true)
    const user = await this.adminsRepository.findOne({
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
    await this.adminsRepository.recover(user);

    this.logger.log(`User account restored successfully: ID ${id}`);
    return user;
  }
}
