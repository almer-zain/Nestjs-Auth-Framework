import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
  UseInterceptors,
  ClassSerializerInterceptor,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RequirePermissions } from './decorators/permissions.decorator';
import { PermissionsGuard } from './guards/permissions.guard';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard) // Attach both Authentication & Authorization Guards
@UseInterceptors(ClassSerializerInterceptor)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @RequirePermissions('permissions.create')
  @ApiOperation({ summary: 'Create a new system permission identifier' })
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @Get()
  @RequirePermissions('permissions.read')
  @ApiOperation({ summary: 'Retrieve paginated list of permissions' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.permissionsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('permissions.read')
  @ApiOperation({ summary: 'Fetch permission details by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('permissions.update')
  @ApiOperation({ summary: 'Modify permission string or description' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('permissions.delete')
  @ApiOperation({ summary: 'Permanently remove a system permission' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('permissions.restore')
  @ApiOperation({ summary: 'Restore a soft-deleted permission' })
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.restore(id);
  }
}
