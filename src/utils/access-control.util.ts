import { ForbiddenException } from '@nestjs/common';
import { JwtPayload } from 'src/common/types/jwt-types';

export class AccessControlUtil {
  /**
   * Checks if the user is a Main Admin or has wildcard '*' permissions.
   */
  static isAdmin(user: JwtPayload): boolean {
    if (!user) return false;

    // Check if account type is admin OR has full wildcard permission
    return user.type === 'admin' || user.permissions?.includes('*');
  }

  /**
   * Checks if the current user is the owner of a given resource.
   */
  static isOwner(user: JwtPayload, resourceOwnerId: number): boolean {
    if (!user) return false;
    return user.sub === resourceOwnerId;
  }

  /**
   * THE GOLDEN RULE OF B2B SAAS:
   * Passes if the user is an Admin OR if the user owns the resource.
   * Throws ForbiddenException otherwise.
   *
   * @param user - Current authenticated user payload from request
   * @param resourceOwnerId - ID of the user who owns the record (e.g. post.authorId)
   * @param customErrorMessage - Optional custom error message
   */
  static checkAdminOrOwner(
    user: JwtPayload,
    resourceOwnerId: number,
    customErrorMessage = 'You do not have permission to modify this resource',
  ): void {
    // 1. Main Admin can edit/delete EVERYTHING
    if (this.isAdmin(user)) {
      return;
    }

    // 2. Regular User can ONLY edit/delete THEIR OWN resource
    if (this.isOwner(user, resourceOwnerId)) {
      return;
    }

    // 3. Otherwise, block request
    throw new ForbiddenException(customErrorMessage);
  }
}
