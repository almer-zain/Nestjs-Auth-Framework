import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  /**
   * Registers a new system permission string.
   *
   * @param dto - Permission definition including name and description
   * @returns The persisted Permission entity
   * @throws ConflictException if the permission name is already defined
   */
  async create(dto: CreatePermissionDto): Promise<Permission> {
    const exists = await this.permissionRepo.findOne({
      where: { name: dto.name },
    });

    if (exists) {
      this.logger.warn(
        `Permission creation failed: ${dto.name} already exists`,
      );
      throw new ConflictException('Permission name already exists');
    }

    const permission = this.permissionRepo.create(dto);
    const saved = await this.permissionRepo.save(permission);

    this.logger.log(`Permission created: ${saved.name} (ID: ${saved.id})`);
    return saved;
  }

  /**
   * Retrieves a paginated list of system permissions.
   *
   * @param query - Pagination parameters (page, limit)
   * @returns Paginated result set with metadata
   */
  async findAll(query: PaginationQueryDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await this.permissionRepo.findAndCount({
      skip,
      take: limit,
      order: { name: 'ASC' },
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
   * Fetches a single permission by its unique ID.
   *
   * @param id - Primary key of the permission
   * @returns The matching Permission entity
   * @throws NotFoundException if the ID does not exist
   */
  async findOne(id: number): Promise<Permission> {
    const permission = await this.permissionRepo.findOne({ where: { id } });

    if (!permission) {
      this.logger.error(`Lookup failed: Permission ID ${id} not found`);
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }
    return permission;
  }

  /**
   * Updates permission metadata or the identifier string.
   *
   * @param id - Target permission ID
   * @param dto - Partial update data
   * @returns The updated Permission entity
   * @throws NotFoundException if the ID does not exist
   * @throws ConflictException if the permission name already taken
   */
  async update(id: number, dto: UpdatePermissionDto): Promise<Permission> {
    const permission = await this.findOne(id);

    if (dto.name && dto.name !== permission.name) {
      const exists = await this.permissionRepo.findOne({
        where: { name: dto.name },
      });
      if (exists) {
        this.logger.warn(
          `Update conflict: Permission name ${dto.name} is taken`,
        );
        throw new ConflictException('Permission name already taken');
      }
    }

    Object.assign(permission, dto);
    const updated = await this.permissionRepo.save(permission);

    this.logger.log(`Permission updated: ID ${id} (${updated.name})`);
    return updated;
  }

  /**
   * Permanently deletes a permission from the system.
   *
   * @param id - Target permission ID
   * @throws NotFoundException if the permissions not found
   */
  async remove(id: number): Promise<void> {
    const permission = await this.findOne(id);
    await this.permissionRepo.softRemove(permission);
    this.logger.warn(`Permission soft-deleted: ID ${id} (${permission.name})`);
  }

  /**
   * Restores a soft-deleted permission.
   *
   * @param id - Target permission ID
   * @throws NotFoundException if the permissions not found
   * @throws ConflictException if the permissions not soft-deleted
   */
  async restore(id: number): Promise<Permission> {
    const permission = await this.permissionRepo.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!permission) {
      this.logger.error(`Restore failed: Permission ID ${id} not found`);
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    if (!permission.deletedAt) {
      throw new ConflictException(`Permission ID ${id} is not deleted`);
    }

    await this.permissionRepo.recover(permission);
    this.logger.log(`Permission restored: ID ${id} (${permission.name})`);
    return permission;
  }
}
