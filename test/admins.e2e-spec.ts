jest.mock('@nestjs-modules/mailer/adapters/handlebars.adapter', () => ({
  HandlebarsAdapter: jest.fn().mockImplementation(() => ({
    compile: jest.fn(),
  })),
}));

jest.mock('nestjs-graceful-shutdown', () => ({
  GracefulShutdownModule: {
    forRoot: jest.fn().mockReturnValue({ module: class {}, providers: [] }),
    forRootAsync: jest
      .fn()
      .mockReturnValue({ module: class {}, providers: [] }),
  },
  setupGracefulShutdown: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Express } from 'express';
import { AppModule } from './../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { CaptchaService } from 'src/modules/auth/captcha.service';
import { MailService } from 'src/modules/mail/mail.service';
import { DeviceService } from 'src/modules/auth/device.service';
import { AuthTestHelper } from './helpers/auth-test.helper';
import { JwtPayload } from 'src/common/types/jwt-types';

/**
 * @file admins.e2e-spec.ts
 * @description End-to-End integration test suite for AdminsController endpoints.
 * Validates SuperAdmin permissions, sub-admin ownership limits, and admin role protection.
 */
describe('AdminsController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let superAdminToken: string;
  let ownerAdminToken: string;
  let otherAdminToken: string;
  let regularUserToken: string;
  let createdAdminId: number;

  const mockCaptchaService = {
    verify: jest.fn().mockResolvedValue(true),
  };

  const mockMailService = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    sendNewDeviceAlert: jest.fn().mockResolvedValue(true),
  };

  const mockDeviceService = {
    checkAndAlert: jest.fn().mockResolvedValue(true),
  };

  // Unique credentials per test run to prevent 409 unique constraint failures
  const testAdminEmail = `admin.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.com`;
  const testAdminUsername = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const unauthEmail = `unauth.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.com`;
  const unauthUsername = `unauth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  beforeAll(async () => {
    // Arrange: Compile testing module with external provider overrides
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CaptchaService)
      .useValue(mockCaptchaService)
      .overrideProvider(MailService)
      .useValue(mockMailService)
      .overrideProvider(DeviceService)
      .useValue(mockDeviceService)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.listen(0);

    jwtService = moduleFixture.get<JwtService>(JwtService);
    const authHelper = new AuthTestHelper(jwtService);

    superAdminToken = await authHelper.createSuperAdminToken();
    regularUserToken = await authHelper.createLimitedUserToken([]);

    // Generate token for a secondary sub-admin to test cross-admin forbidden access
    const otherAdminPayload: JwtPayload = {
      sub: 777777,
      email: 'other_admin@test.com',
      type: 'admin',
      roles: ['SubAdmin'],
      permissions: [],
    };
    otherAdminToken = await jwtService.signAsync(otherAdminPayload, {
      secret: process.env.JWT_ACCESS_SECRET || 'test_access_secret',
      expiresIn: '15m',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * @suite POST /admins
   * @description Test suite for admin account provisioning by SuperAdmin.
   */
  describe('POST /admins', () => {
    /**
     * @test
     * @description Ensures unauthenticated requests are rejected.
     * @given No Authorization header present
     * @when POST /admins request is executed
     * @then Response status should be 401 Unauthorized
     */
    it('should return 401 Unauthorized if no Bearer token is provided', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/admins')
        .send({
          email: unauthEmail,
          username: unauthUsername,
          usernameDisplay: 'E2E Admin',
          password: 'Password123!',
        })
        .expect(401);
    });

    /**
     * @test
     * @description Ensures regular users cannot provision admin accounts.
     * @given Bearer token belonging to a regular user
     * @when POST /admins request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should return 403 Forbidden if caller is a regular user', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/admins')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({
          email: unauthEmail,
          username: unauthUsername,
          usernameDisplay: 'E2E Admin',
          password: 'Password123!',
        })
        .expect(403);
    });

    /**
     * @test
     * @description Ensures SuperAdmin can provision a new administrative account.
     * @given SuperAdmin Bearer token and valid admin creation DTO
     * @when POST /admins request is executed
     * @then Response status should be 201 Created and return admin entity
     */
    it('should create a new admin successfully when caller is SuperAdmin', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .post('/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testAdminEmail,
          username: testAdminUsername,
          usernameDisplay: 'E2E Admin',
          password: 'Password123!',
        })
        .expect(201);

      // Assert
      const body = response.body as {
        id: number;
        email: string;
        username: string;
      };

      createdAdminId = body.id;

      expect(body).toHaveProperty('id');
      expect(body.email).toBe(testAdminEmail);
      expect(body.username).toBe(testAdminUsername);

      // Arrange token for newly created sub-admin to test self-ownership endpoints
      const ownerPayload: JwtPayload = {
        sub: createdAdminId,
        email: testAdminEmail,
        type: 'admin',
        roles: ['SubAdmin'],
        permissions: [],
      };
      ownerAdminToken = await jwtService.signAsync(ownerPayload, {
        secret: process.env.JWT_ACCESS_SECRET || 'test_access_secret',
        expiresIn: '15m',
      });
    });

    /**
     * @test
     * @description Ensures duplicate admin creation fails on unique constraints.
     * @given SuperAdmin Bearer token and duplicate email/username
     * @when POST /admins request is executed
     * @then Response status should be 409 Conflict
     */
    it('should return 409 Conflict if admin email or username already exists', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testAdminEmail,
          username: testAdminUsername,
          usernameDisplay: 'Duplicate Admin',
          password: 'Password123!',
        })
        .expect(409);
    });
  });

  /**
   * @suite GET /admins
   * @description Test suite for fetching admin list (SuperAdmin Restricted).
   */
  describe('GET /admins', () => {
    /**
     * @test
     * @description Ensures sub-admins lacking 'admins.read' cannot view full admin list.
     * @given Sub-admin Bearer token without permissions
     * @when GET /admins request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should return 403 Forbidden when sub-admin attempts to list admins', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .get('/admins')
        .set('Authorization', `Bearer ${ownerAdminToken}`)
        .expect(403);
    });

    /**
     * @test
     * @description Ensures SuperAdmin can retrieve paginated admin list.
     * @given SuperAdmin Bearer token
     * @when GET /admins request is executed
     * @then Response status should be 200 OK with paginated structure
     */
    it('should retrieve a paginated list of admins when caller is SuperAdmin', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .get('/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      // Assert
      const body = response.body as {
        data: unknown[];
        meta: Record<string, unknown>;
      };
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  /**
   * @suite GET /admins/:id
   * @description Test suite for single admin profile retrieval and ownership checks.
   */
  describe('GET /admins/:id', () => {
    /**
     * @test
     * @description Ensures a sub-admin can fetch their own admin profile.
     * @given Sub-admin Bearer token (sub === targetId)
     * @when GET /admins/:id request is executed
     * @then Response status should be 200 OK
     */
    it('should allow sub-admin to fetch their own admin profile', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .get(`/admins/${createdAdminId}`)
        .set('Authorization', `Bearer ${ownerAdminToken}`)
        .expect(200);

      // Assert
      const body = response.body as { id: number; email: string };
      expect(body.id).toBe(createdAdminId);
    });

    /**
     * @test
     * @description Ensures a sub-admin cannot fetch another admin profile.
     * @given Secondary sub-admin Bearer token (sub !== targetId)
     * @when GET /admins/:id request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should block sub-admin from fetching another admin profile', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .get(`/admins/${createdAdminId}`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(403);
    });

    /**
     * @test
     * @description Ensures SuperAdmin can fetch any admin profile.
     * @given SuperAdmin Bearer token
     * @when GET /admins/:id request is executed
     * @then Response status should be 200 OK
     */
    it('should allow SuperAdmin to fetch any admin profile', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .get(`/admins/${createdAdminId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      // Assert
      const body = response.body as { id: number };
      expect(body.id).toBe(createdAdminId);
    });
  });

  /**
   * @suite PATCH /admins/:id
   * @description Test suite for admin profile updates and role assignment protection.
   */
  describe('PATCH /admins/:id', () => {
    /**
     * @test
     * @description Ensures a sub-admin can update their own displayName.
     * @given Sub-admin Bearer token
     * @when PATCH /admins/:id request is executed with updated displayName
     * @then Response status should be 200 OK and reflect updated name
     */
    it('should allow sub-admin to update their own profile details', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .patch(`/admins/${createdAdminId}`)
        .set('Authorization', `Bearer ${ownerAdminToken}`)
        .send({ usernameDisplay: 'Updated Admin Display' })
        .expect(200);

      // Assert
      const body = response.body as {
        usernameDisplay?: string;
        displayName?: string;
      };
      expect(body.usernameDisplay ?? body.displayName).toBe(
        'Updated Admin Display',
      );
    });

    /**
     * @test
     * @description Ensures field-level protection strips roleIds when passed by non-SuperAdmins.
     * @given Sub-admin Bearer token attempting role escalation via roleIds
     * @when PATCH /admins/:id request is executed with roleIds payload
     * @then Response status should be 200 OK but roleIds payload is safely ignored/stripped
     */
    it('should strip roleIds when a sub-admin attempts self-role escalation', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .patch(`/admins/${createdAdminId}`)
        .set('Authorization', `Bearer ${ownerAdminToken}`)
        .send({ roleIds: [1] })
        .expect(200);

      // Assert
      const body = response.body as { roles?: unknown[] };
      expect(body.roles).toEqual([]);
    });

    /**
     * @test
     * @description Ensures a sub-admin cannot update another admin profile.
     * @given Secondary sub-admin Bearer token (sub !== targetId)
     * @when PATCH /admins/:id request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should block sub-admin from updating another admin profile', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .patch(`/admins/${createdAdminId}`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .send({ usernameDisplay: 'Hacked Admin' })
        .expect(403);
    });
  });

  /**
   * @suite DELETE /admins/:id
   * @description Test suite for soft-deleting admin accounts endpoint.
   */
  describe('DELETE /admins/:id', () => {
    /**
     * @test
     * @description Ensures sub-admins cannot soft-delete admin accounts.
     * @given Sub-admin Bearer token
     * @when DELETE /admins/:id request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should block sub-admins from soft-deleting admin accounts', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .delete(`/admins/${createdAdminId}`)
        .set('Authorization', `Bearer ${ownerAdminToken}`)
        .expect(403);
    });

    /**
     * @test
     * @description Ensures SuperAdmin can soft-delete admin accounts.
     * @given SuperAdmin Bearer token
     * @when DELETE /admins/:id request is executed
     * @then Response status should be 200 OK
     */
    it('should allow SuperAdmin to soft-delete target admin account', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .delete(`/admins/${createdAdminId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });

  /**
   * @suite PATCH /admins/:id/restore
   * @description Test suite for restoring soft-deleted admin accounts endpoint.
   */
  describe('PATCH /admins/:id/restore', () => {
    /**
     * @test
     * @description Ensures SuperAdmin can restore soft-deleted admin accounts.
     * @given SuperAdmin Bearer token and soft-deleted target admin ID
     * @when PATCH /admins/:id/restore request is executed
     * @then Response status should be 200 OK and return restored entity
     */
    it('should allow SuperAdmin to restore soft-deleted admin account', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .patch(`/admins/${createdAdminId}/restore`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      // Assert
      const body = response.body as { id: number };
      expect(body.id).toBe(createdAdminId);
    });
  });
});
