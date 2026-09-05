import { ForbiddenException } from '@nestjs/common';
import { JwtPayload } from 'src/common/types/jwt-types';

export class AccessControlUtil {
  /**
   * Checks if the user is a SuperAdmin (or has wildcard '*' permissions).
   */
  static isAdmin(user: JwtPayload): boolean {
    if (!user) return false;

    return Boolean(
      user.roles?.includes('SuperAdmin') || user.permissions?.includes('*'),
    );
  }

  /**
   * Checks if the current user is the owner of a given resource.
   * Resolves ID across standard sub, id, and userId payload formats.
   */
  static isOwner(user: JwtPayload, resourceOwnerId: number): boolean {
    if (!user) return false;

    const userRecord = user as unknown as Record<string, unknown>;
    const userId = user.sub ?? userRecord.id ?? userRecord.userId;

    if (userId === undefined || userId === null) return false;

    return Number(userId) === Number(resourceOwnerId);
  }

  /**
   * Passes if the user is a SuperAdmin OR if the user owns the resource.
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

    if (this.isAdmin(user)) {
      return;
    }

    if (this.isOwner(user, resourceOwnerId)) {
      return;
    }

    throw new ForbiddenException(customErrorMessage);
  }
}
