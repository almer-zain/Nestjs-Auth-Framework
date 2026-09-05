import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithUser } from 'src/common/types/jwt-types';
import { AccessControlUtil } from 'src/utils/access-control.util';
import { REQUIRE_PERMISSIONS } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );

    // If no permission decorator is present, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    if (AccessControlUtil.isAdmin(user)) {
      return true;
    }

    // Checks if user possesses ALL required permissions for the endpoint
    const hasAllPermissions = requiredPermissions.every((perm) =>
      user.permissions.includes(perm),
    );

    if (!user.permissions || user.permissions.length === 0) {
      throw new ForbiddenException('No permissions assigned to this account');
    }

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: [${requiredPermissions.join(', ')}]`,
      );
    }
    return true;
  }
}
