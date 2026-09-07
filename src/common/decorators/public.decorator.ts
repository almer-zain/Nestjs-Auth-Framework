import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks an endpoint or controller as public, bypassing global authentication and ban guards.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
