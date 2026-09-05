import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSIONS = 'require_permissions';

/**
 * Spatie-style permission decorator.
 * Usage: @RequirePermissions('users.create', 'users.update')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS, permissions);
