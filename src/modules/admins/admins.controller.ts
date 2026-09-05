import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  ClassSerializerInterceptor,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminsService } from './admins.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { CurrentUser } from 'src/common/decorator/current-user.decorator';
import type { JwtPayload } from 'src/common/types/jwt-types';
import { RequirePermissions } from '../permissions/decorators/permissions.decorator';

@ApiTags('Admins')
@ApiBearerAuth()
@Controller('admins')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Get()
  @RequirePermissions('admins.read')
  @ApiOperation({ summary: 'Retrieve paginated list of administrators' })
  @ApiOkResponse({
    description: 'Returns a paginated list of admins and metadata',
  })
  findAll(@Query() query: PaginationQueryDto) {
    return this.adminsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch administrator by unique ID' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.adminsService.findOne(id, currentUser);
  }

  @Post()
  @RequirePermissions('admins.create')
  @ApiOperation({ summary: 'Register a new administrative account' })
  create(@Body() createAdminDto: CreateAdminDto) {
    return this.adminsService.create(createAdminDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update administrator details or roles' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAdminDto: UpdateAdminDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.adminsService.update(id, updateAdminDto, currentUser);
  }

  @Delete(':id')
  @RequirePermissions('admins.delete')
  @ApiOperation({ summary: 'Scrub and soft-delete administrator' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.adminsService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('admins.restore')
  @ApiOperation({ summary: 'Restore soft-deleted administrator' })
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.adminsService.restore(id);
  }
}
