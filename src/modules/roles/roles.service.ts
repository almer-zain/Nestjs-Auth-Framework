import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  /**
   * Creates a new security role and associates initial permissions.
   *
   * @param dto - Role definition and associated permission IDs
   * @returns The created Role entity
   * @throws ConflictException if the role name already exists
   */
  async create(dto: CreateRoleDto): Promise<Role> {
    const exists = await this.roleRepo.findOne({ where: { name: dto.name } });
    if (exists) {
      this.logger.warn(`Role creation conflict: ${dto.name} already exists`);
      throw new ConflictException('Role with this name already exists');
    }

    const role = this.roleRepo.create({ name: dto.name });
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      role.permissions = await this.permissionRepo.findBy({
        id: In(dto.permissionIds),
      });
    }
    const saved = await this.roleRepo.save(role);
    this.logger.log(`Role created: ${saved.name} (ID: ${saved.id})`);
    return saved;
  }

  /**
   * Retrieves a paginated list of roles including their assigned permissions.
   *
   * @param query - Pagination parameters
   * @returns Paginated roles with metadata
   */
  async findAll(query: PaginationQueryDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await this.roleRepo.findAndCount({
      relations: ['permissions'],
      skip,
      take: limit,
      order: { id: 'ASC' },
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
   * Fetches a single role by ID with its permission set.
   *
   * @param id - Role primary key
   * @returns The Role entity
   * @throws NotFoundException if the role is not found
   */
  async findOne(id: number): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: ['permissions'],
    });

    if (!role) {
      this.logger.error(`Lookup failed: Role ID ${id} not found`);
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }

  /**
   * Updates role metadata or permission mappings.
   *
   * @param id - Target role ID
   * @param dto - Update data
   * @returns The updated Role entity
   */
  async update(id: number, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);

    if (dto.name && dto.name !== role.name) {
      const exists = await this.roleRepo.findOne({ where: { name: dto.name } });
      if (exists) {
        throw new ConflictException('Role name already taken');
      }
      role.name = dto.name;
    }

    if (dto.permissionIds) {
      role.permissions = await this.permissionRepo.findBy({
        id: In(dto.permissionIds),
      });
    }

    const updated = await this.roleRepo.save(role);
    this.logger.log(`Role updated: ID ${id} (${updated.name})`);
    return updated;
  }

  /**
   * Soft-deletes a role.
   * Optionally reassigns all users/admins holding this role to a replacement role first.
   *
   * @param id - Role ID to delete
   * @param reassignToRoleId - Optional replacement Role ID
   * @throws BadRequestException If cannot reassign to the role being deleted
   * @throws ConflictException if the role is not deleted
   */
  async remove(id: number, reassignToRoleId?: number): Promise<void> {
    const roleToDelete = await this.findOne(id);

    // If a replacement role is provided, migrate users & admins
    if (reassignToRoleId) {
      if (reassignToRoleId === id) {
        throw new BadRequestException(
          'Cannot reassign to the role being deleted',
        );
      }

      const replacementRole = await this.findOne(reassignToRoleId);

      // Reassign users holding the deleted role to the replacement role
      await this.roleRepo.manager.query(
        `UPDATE "users_roles_roles" SET "rolesId" = $1 WHERE "rolesId" = $2`,
        [replacementRole.id, roleToDelete.id],
      );

      // Reassign admins holding the deleted role to the replacement role
      await this.roleRepo.manager.query(
        `UPDATE "admin_roles_roles" SET "rolesId" = $1 WHERE "rolesId" = $2`,
        [replacementRole.id, roleToDelete.id],
      );

      this.logger.log(
        `Reassigned accounts from Role ID ${id} to Role ID ${reassignToRoleId}`,
      );
    }

    await this.roleRepo.softRemove(roleToDelete);
    this.logger.warn(`Role soft-deleted: ID ${id} (${roleToDelete.name})`);
  }

  /**
   * Restores a soft-deleted role.
   *
   * @param id - Target role ID
   * @returns The restored Role entity
   * @throws NotFoundException if the role is not found
   * @throws ConflictException if the role is not deleted
   */
  async restore(id: number): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!role) {
      throw new NotFoundException(`Role ID ${id} not found`);
    }

    if (!role.deletedAt) {
      throw new ConflictException(`Role ID ${id} is not deleted`);
    }

    await this.roleRepo.recover(role);
    this.logger.log(`Role restored: ID ${id} (${role.name})`);
    return role;
  }
}
