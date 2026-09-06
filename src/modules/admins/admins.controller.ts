import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AdminsService } from './admins.service';
import { BanUserDto } from './dto/ban-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { RequirePermissions } from '../permissions/decorators/permissions.decorator';

@ApiTags('Admin Operations')
@ApiBearerAuth()
@Controller('admins')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Get('users')
  @RequirePermissions('users.read', 'admins.manage')
  @ApiOperation({ summary: 'Admin search and overview of all user accounts' })
  @ApiResponse({ status: 200, description: 'Paginated user moderation list' })
  listUsers(
    @Query()
    query: PaginationQueryDto & { search?: string; isBanned?: boolean },
  ) {
    return this.adminsService.listUsers(query);
  }

  @Patch('users/:id/ban')
  @RequirePermissions('users.ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ban a user and revoke all active sessions' })
  @ApiResponse({ status: 200, description: 'User has been banned' })
  @ApiBadRequestResponse({ description: 'User is already banned' })
  @ApiNotFoundResponse({ description: 'User not found' })
  banUser(@Param('id', ParseIntPipe) id: number, @Body() dto: BanUserDto) {
    return this.adminsService.banUser(id, dto);
  }

  @Patch('users/:id/unban')
  @RequirePermissions('users.ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unban a user account' })
  @ApiResponse({ status: 200, description: 'User unbanned successfully' })
  @ApiBadRequestResponse({ description: 'User is not banned' })
  unbanUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminsService.unbanUser(id);
  }

  @Patch('users/:id/roles')
  @RequirePermissions('roles.assign', 'admins.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign or modify security roles for a user' })
  @ApiResponse({
    status: 200,
    description: 'Roles updated and refresh tokens invalidated',
  })
  assignRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignRolesDto,
  ) {
    return this.adminsService.assignRoles(id, dto);
  }

  @Post('users/:id/force-logout')
  @RequirePermissions('users.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate all active sessions for a user' })
  @ApiResponse({ status: 200, description: 'User forcefully logged out' })
  forceLogout(@Param('id', ParseIntPipe) id: number) {
    return this.adminsService.forceLogout(id);
  }
}
