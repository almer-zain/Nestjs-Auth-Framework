import { ForbiddenException } from '@nestjs/common';
import { JwtPayload } from 'src/common/types/jwt-types';

export class AccessControlUtil {
  /**
   * Checks if the user is a SuperAdmin, Admin, or has wildcard '*' permissions.
   */
  static isAdmin(user: JwtPayload): boolean {
    if (!user) return false;

    const hasAdminRole = user.roles?.some((role) =>
      ['SuperAdmin', 'Admin'].includes(role),
    );
    const hasWildcardPermission = user.permissions?.includes('*');

    return Boolean(hasAdminRole || hasWildcardPermission);
  }

  /**
   * Checks if the current user is the owner of a given resource.
   */
  static isOwner(user: JwtPayload, resourceOwnerId: number): boolean {
    if (!user || user.sub === undefined || user.sub === null) return false;
    return Number(user.sub) === Number(resourceOwnerId);
  }

  /**
   * Passes if the user has Admin rights OR owns the resource.
   * Throws ForbiddenException otherwise.
   */
  static checkAdminOrOwner(
    user: JwtPayload,
    resourceOwnerId: number,
    customErrorMessage = 'You do not have permission to modify this resource',
  ): void {
    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    if (this.isAdmin(user) || this.isOwner(user, resourceOwnerId)) {
      return;
    }

    throw new ForbiddenException(customErrorMessage);
  }
}
