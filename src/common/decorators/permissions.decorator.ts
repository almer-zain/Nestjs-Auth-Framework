// decorators/permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSIONS = 'permissions';
export const Permissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS, permissions);
