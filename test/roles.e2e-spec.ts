jest.mock('@nestjs-modules/mailer/adapters/handlebars.adapter', () => ({
  HandlebarsAdapter: jest.fn().mockImplementation(() => ({
    compile: jest.fn(),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Express } from 'express';
import { JwtService } from '@nestjs/jwt';
import { CaptchaService } from 'src/modules/auth/captcha.service';
import { MailService } from 'src/modules/mail/mail.service';
import { DeviceService } from 'src/modules/auth/device.service';
import { AppModule } from 'src/app.module';
import { AuthTestHelper } from './helpers/auth-test.helper';
import { setupGracefulShutdown } from 'nestjs-graceful-shutdown';

/**
 * @file roles.e2e-spec.ts
 * @description End-to-End integration test suite for RolesController endpoints.
 * Validates authentication guards, permission guards, validation pipes, and CRUD operations.
 */
describe('RolesController (e2e)', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let unauthorizedToken: string;
  let createdRoleId: number = 1;

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

    setupGracefulShutdown({ app });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.listen(0);

    const jwtService = moduleFixture.get<JwtService>(JwtService);
    const authHelper = new AuthTestHelper(jwtService);

    superAdminToken = await authHelper.createSuperAdminToken();
    unauthorizedToken = await authHelper.createLimitedUserToken([]);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * @suite POST /roles
   * @description Test suite for security and creation logic on POST /roles endpoint.
   */
  describe('POST /roles', () => {
    /**
     * @test
     * @description Ensures unauthenticated requests are rejected.
     * @given No Authorization header present
     * @when POST /roles request is executed
     * @then Response status should be 401 Unauthorized
     */
    it('should return 401 Unauthorized if no Bearer token is provided', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/roles')
        .send({ name: `e2e-${Math.random().toString(36).slice(2)}` })
        .expect(401);
    });

    /**
     * @test
     * @description Ensures permission guards block users lacking 'roles.create'.
     * @given Bearer token without required permissions
     * @when POST /roles request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should return 403 Forbidden if user lacks roles.create permission', async () => {
      // Act & Assert
      const response = await request(app.getHttpServer() as unknown as Express)
        .post('/roles')
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .send({ name: `e2e-${Math.random().toString(36).slice(2)}` })
        .expect(403);

      console.log(response.status);
      console.log(response.body);
    });

    /**
     * @test
     * @description Ensures a valid role record is created when caller has full permissions.
     * @given Bearer token belonging to SuperAdmin
     * @when POST /roles request is executed with valid payload
     * @then Response status should be 201 Created and return populated role record
     */
    it('should create a new role successfully when caller is authorized', async () => {
      const roleName = `e2e-omega-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .post('/roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: roleName,
          permissionIds: [],
        });

      expect(response.status).toBe(201);

      // Assert
      const body = response.body as { id: number; name: string };
      expect(body).toHaveProperty('id');
      expect(body.name).toBe(roleName);

      createdRoleId = body.id;
    });

    /**
     * @test
     * @description Ensures duplicate role creation is blocked by uniqueness constraint.
     * @given Bearer token belonging to SuperAdmin and an existing role name
     * @when POST /roles request is executed
     * @then Response status should be 409 Conflict
     */
    it('should return 409 Conflict if role name already exists', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: `e2e-omega`,
          permissionIds: [],
        })
        .expect(409);
    });
  });

  /**
   * @suite GET /roles
   * @description Test suite for paginated role listing endpoint.
   */
  describe('GET /roles', () => {
    /**
     * @test
     * @description Ensures authorized caller can fetch paginated role results.
     * @given Bearer token belonging to SuperAdmin
     * @when GET /roles request is executed
     * @then Response status should be 200 OK with paginated data structure
     */
    it('should retrieve a paginated list of roles', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .get('/roles')
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
   * @suite GET /roles/:id
   * @description Test suite for single role retrieval endpoint.
   */
  describe('GET /roles/:id', () => {
    /**
     * @test
     * @description Ensures single role record can be fetched by ID.
     * @given Valid role ID and SuperAdmin Bearer token
     * @when GET /roles/:id request is executed
     * @then Response status should be 200 OK and match requested record
     */
    it('should fetch a single role by ID', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .get(`/roles/${createdRoleId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      // Assert
      const body = response.body as { id: number; name: string };
      expect(body.id).toBe(createdRoleId);
    });

    /**
     * @test
     * @description Ensures request fails when target role ID does not exist.
     * @given Non-existent role ID (999999) and SuperAdmin Bearer token
     * @when GET /roles/:id request is executed
     * @then Response status should be 404 Not Found
     */
    it('should return 404 NotFound for non-existent role ID', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .get('/roles/999999')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(404);
    });
  });

  /**
   * @suite PATCH /roles/:id
   * @description Test suite for role updating endpoint.
   */
  describe('PATCH /roles/:id', () => {
    /**
     * @test
     * @description Ensures existing role details can be modified.
     * @given Valid role ID and SuperAdmin Bearer token
     * @when PATCH /roles/:id request is executed with new name
     * @then Response status should be 200 OK and reflect updated details
     */
    it('should update role name successfully', async () => {
      const roleName = `e2e-${Math.random().toString(36).slice(2)}`;
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .patch(`/roles/${createdRoleId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: roleName,
          permissionIds: [],
        })
        .expect(200);

      // Assert
      const body = response.body as { id: number; name: string };
      expect(body.name).toBe(roleName);
    });
  });

  /**
   * @suite DELETE /roles/:id
   * @description Test suite for soft-deleting roles endpoint.
   */
  describe('DELETE /roles/:id', () => {
    /**
     * @test
     * @description Ensures target role is soft-deleted.
     * @given Valid role ID and SuperAdmin Bearer token
     * @when DELETE /roles/:id request is executed
     * @then Response status should be 200 OK
     */
    it('should soft-delete target role', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .delete(`/roles/${createdRoleId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });

  /**
   * @suite PATCH /roles/:id/restore
   * @description Test suite for restoring soft-deleted roles endpoint.
   */
  describe('PATCH /roles/:id/restore', () => {
    /**
     * @test
     * @description Ensures soft-deleted role is recovered.
     * @given Soft-deleted role ID and SuperAdmin Bearer token
     * @when PATCH /roles/:id/restore request is executed
     * @then Response status should be 200 OK and return restored entity
     */
    it('should restore target soft-deleted role', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .patch(`/roles/${createdRoleId}/restore`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      // Assert
      const body = response.body as { id: number };
      expect(body.id).toBe(createdRoleId);
    });
  });
});
