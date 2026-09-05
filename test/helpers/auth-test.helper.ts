import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from 'src/common/types/jwt-types';

export class AuthTestHelper {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Generates a signed access token for a simulated SuperAdmin.
   */
  async createSuperAdminToken(): Promise<string> {
    const payload: JwtPayload = {
      sub: 1,
      email: 'admin@test.com',
      type: 'admin',
      roles: ['SuperAdmin'],
      permissions: ['*'], // Full wildcard access
    };

    return this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET || 'test_access_secret',
      expiresIn: '15m',
    });
  }

  /**
   * Generates a signed access token for a standard user with limited permissions.
   */
  async createLimitedUserToken(permissions: string[] = []): Promise<string> {
    const payload: JwtPayload = {
      sub: 999,
      email: 'user@test.com',
      type: 'user',
      roles: ['User'],
      permissions,
    };

    return this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET || 'test_access_secret',
      expiresIn: '15m',
    });
  }
}
