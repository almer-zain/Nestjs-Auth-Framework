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
 * @file users.e2e-spec.ts
 * @description End-to-End integration test suite for UsersController endpoints.
 * Validates authentication guards, permission guards, resource ownership checks, and field-level protection.
 */
describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let superAdminToken: string;
  let ownerUserToken: string;
  let otherUserToken: string;
  let createdUserId: number;

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

  // Dynamic credentials to prevent 409 Unique Constraint collisions
  const testUserEmail = `user.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.com`;
  const testUsername = `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const unauthUserEmail = `unauth.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.com`;
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

    // Generate token for a secondary user to test forbidden cross-account access
    const otherPayload: JwtPayload = {
      sub: 888888,
      email: 'other_user@test.com',
      type: 'user',
      roles: ['User'],
      permissions: [],
    };
    otherUserToken = await jwtService.signAsync(otherPayload, {
      secret: process.env.JWT_ACCESS_SECRET || 'test_access_secret',
      expiresIn: '15m',
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /**
   * @suite POST /users
   * @description Test suite for user registration/provisioning by Admin.
   */
  describe('POST /users', () => {
    /**
     * @test
     * @description Ensures unauthenticated requests are rejected.
     * @given No Authorization header present
     * @when POST /users request is executed
     * @then Response status should be 401 Unauthorized
     */
    it('should return 401 Unauthorized if no Bearer token is provided', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/users')
        .send({
          email: unauthUserEmail,
          username: unauthUsername,
          usernameDisplay: 'E2E User',
          password: 'Password123!',
        })
        .expect(401);
    });

    /**
     * @test
     * @description Ensures non-admins cannot provision new users.
     * @given Bearer token belonging to a regular user
     * @when POST /users request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should return 403 Forbidden if caller lacks users.create permission', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/users')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          email: unauthUserEmail,
          username: unauthUsername,
          usernameDisplay: 'E2E User',
          password: 'Password123!',
        })
        .expect(403);
    });

    /**
     * @test
     * @description Ensures SuperAdmin can provision a new user account.
     * @given SuperAdmin Bearer token and valid registration DTO
     * @when POST /users request is executed
     * @then Response status should be 201 Created and return user entity
     */
    it('should create a new user successfully when caller is authorized', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .post('/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testUserEmail,
          username: testUsername,
          usernameDisplay: 'E2E User',
          password: 'Password123!',
        })
        .expect(201);

      // Assert
      const body = response.body as {
        id: number;
        email: string;
        username: string;
      };

      createdUserId = body.id;

      expect(body).toHaveProperty('id');
      expect(body.email).toBe(testUserEmail);
      expect(body.username).toBe(testUsername);

      // Arrange token for the newly created user to test self-ownership routes
      const ownerPayload: JwtPayload = {
        sub: createdUserId,
        email: testUserEmail,
        type: 'user',
        roles: ['User'],
        permissions: [],
      };
      ownerUserToken = await jwtService.signAsync(ownerPayload, {
        secret: process.env.JWT_ACCESS_SECRET || 'test_access_secret',
        expiresIn: '15m',
      });
    });

    /**
     * @test
     * @description Ensures duplicate user creation fails on unique constraints.
     * @given SuperAdmin Bearer token and duplicate email/username
     * @when POST /users request is executed
     * @then Response status should be 409 Conflict
     */
    it('should return 409 Conflict if email or username already exists', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testUserEmail,
          username: testUsername,
          usernameDisplay: 'Duplicate User',
          password: 'Password123!',
        })
        .expect(409);
    });
  });

  /**
   * @suite GET /users
   * @description Test suite for fetching user list (Admin Restricted).
   */
  describe('GET /users', () => {
    /**
     * @test
     * @description Ensures regular users cannot retrieve full user lists.
     * @given Regular user Bearer token
     * @when GET /users request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should return 403 Forbidden when regular user attempts to list users', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .get('/users')
        .set('Authorization', `Bearer ${ownerUserToken}`)
        .expect(403);
    });

    /**
     * @test
     * @description Ensures SuperAdmin can retrieve paginated user list.
     * @given SuperAdmin Bearer token
     * @when GET /users request is executed
     * @then Response status should be 200 OK with paginated structure
     */
    it('should retrieve a paginated list of users when caller is SuperAdmin', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .get('/users')
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
   * @suite GET /users/:id
   * @description Test suite for single profile retrieval and ownership verification.
   */
  describe('GET /users/:id', () => {
    /**
     * @test
     * @description Ensures a user can fetch their own profile.
     * @given Account owner Bearer token (sub === targetId)
     * @when GET /users/:id request is executed
     * @then Response status should be 200 OK
     */
    it('should allow user to fetch their own profile', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .get(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${ownerUserToken}`)
        .expect(200);

      // Assert
      const body = response.body as { id: number; email: string };
      expect(body.id).toBe(createdUserId);
    });

    /**
     * @test
     * @description Ensures a user cannot fetch another user's profile.
     * @given Secondary user Bearer token (sub !== targetId)
     * @when GET /users/:id request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should block user from fetching another user profile', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .get(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);
    });

    /**
     * @test
     * @description Ensures SuperAdmin can fetch any user profile.
     * @given SuperAdmin Bearer token
     * @when GET /users/:id request is executed
     * @then Response status should be 200 OK
     */
    it('should allow SuperAdmin to fetch any user profile', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .get(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      // Assert
      const body = response.body as { id: number };
      expect(body.id).toBe(createdUserId);
    });
  });

  /**
   * @suite PATCH /users/:id
   * @description Test suite for profile updates and field-level protection.
   */
  describe('PATCH /users/:id', () => {
    /**
     * @test
     * @description Ensures a user can update their own displayName.
     * @given Account owner Bearer token
     * @when PATCH /users/:id request is executed with updated displayName
     * @then Response status should be 200 OK and reflect updated name
     */
    it('should allow user to update their own profile details', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .patch(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${ownerUserToken}`)
        .send({ usernameDisplay: 'updated display name' })
        .expect(200);

      // Assert
      const body = response.body as {
        usernameDisplay?: string;
        displayName?: string;
      };
      expect(body.usernameDisplay ?? body.displayName).toBe(
        'updated display name',
      );
    });

    /**
     * @test
     * @description Ensures field-level protection strips roleIds when passed by regular users.
     * @given Account owner Bearer token attempting privilege escalation via roleIds
     * @when PATCH /users/:id request is executed with roleIds payload
     * @then Response status should be 200 OK but roleIds payload is safely ignored/stripped
     */
    it('should strip roleIds when a non-admin attempts self-role escalation', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .patch(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${ownerUserToken}`)
        .send({ roleIds: [1] })
        .expect(200);

      // Assert
      const body = response.body as { roles?: unknown[] };
      expect(body.roles).toEqual([]);
    });

    /**
     * @test
     * @description Ensures a user cannot update another user's profile.
     * @given Secondary user Bearer token (sub !== targetId)
     * @when PATCH /users/:id request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should block user from updating another user profile', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .patch(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ usernameDisplay: 'Hacked Name' })
        .expect(403);
    });
  });

  /**
   * @suite DELETE /users/:id
   * @description Test suite for soft-deleting users endpoint.
   */
  describe('DELETE /users/:id', () => {
    /**
     * @test
     * @description Ensures regular users cannot soft-delete user accounts.
     * @given Regular user Bearer token
     * @when DELETE /users/:id request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should block non-admins from soft-deleting user accounts', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .delete(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${ownerUserToken}`)
        .expect(403);
    });

    /**
     * @test
     * @description Ensures SuperAdmin can soft-delete user accounts.
     * @given SuperAdmin Bearer token
     * @when DELETE /users/:id request is executed
     * @then Response status should be 200 OK
     */
    it('should allow SuperAdmin to soft-delete target user account', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .delete(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });

  /**
   * @suite PATCH /users/:id/restore
   * @description Test suite for restoring soft-deleted users endpoint.
   */
  describe('PATCH /users/:id/restore', () => {
    /**
     * @test
     * @description Ensures SuperAdmin can restore soft-deleted user accounts.
     * @given SuperAdmin Bearer token and soft-deleted target user ID
     * @when PATCH /users/:id/restore request is executed
     * @then Response status should be 200 OK and return restored entity
     */
    it('should allow SuperAdmin to restore soft-deleted user account', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .patch(`/users/${createdUserId}/restore`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      // Assert
      const body = response.body as { id: number };
      expect(body.id).toBe(createdUserId);
    });
  });
});
