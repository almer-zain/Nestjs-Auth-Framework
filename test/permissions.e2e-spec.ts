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

/**
 * @file permissions.e2e-spec.ts
 * @description End-to-End integration test suite for PermissionsController endpoints.
 * Validates authentication guards, permission guards, validation pipes, and CRUD operations.
 */
describe('PermissionsController (e2e)', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let unauthorizedToken: string;
  let createdPermissionId: number;

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

  const unauthPermissionName = `perm.unauth.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  const testPermissionName = `perm.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  const updatedPermissionName = `perm.updated.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;

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

    const jwtService = moduleFixture.get<JwtService>(JwtService);
    const authHelper = new AuthTestHelper(jwtService);

    superAdminToken = await authHelper.createSuperAdminToken();
    unauthorizedToken = await authHelper.createLimitedUserToken([]);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * @suite POST /permissions
   * @description Test suite for security and creation logic on POST /permissions endpoint.
   */
  describe('POST /permissions', () => {
    /**
     * @test
     * @description Ensures unauthenticated requests are rejected.
     * @given No Authorization header present
     * @when POST /permissions request is executed
     * @then Response status should be 401 Unauthorized
     */
    it('should return 401 Unauthorized if no Bearer token is provided', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/permissions')
        .send({
          name: testPermissionName,
          description: 'e2e test description',
        })
        .expect(401);
    });

    /**
     * @test
     * @description Ensures permission guards block users lacking 'permissions.create'.
     * @given Bearer token without required permissions
     * @when POST /permissions request is executed
     * @then Response status should be 403 Forbidden
     */
    it('should return 403 Forbidden if user lacks permissions.create permission', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/permissions')
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .send({
          name: unauthPermissionName,
          description: 'e2e test description',
        })
        .expect(403);
    });

    /**
     * @test
     * @description Ensures a valid permission record is created when caller has full permissions.
     * @given Bearer token belonging to SuperAdmin
     * @when POST /permissions request is executed with valid payload
     * @then Response status should be 201 Created and return populated permission record
     */
    it('should create a new permission successfully when caller is authorized', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .post('/permissions')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: testPermissionName,
          description: 'e2e test description',
        })
        .expect(201);

      // Assert
      const body = response.body as {
        id: number;
        name: string;
        description: string;
      };
      expect(body).toHaveProperty('id');
      expect(body.name).toBe(testPermissionName);
      expect(body.description).toBe('e2e test description');

      createdPermissionId = body.id;
    });

    /**
     * @test
     * @description Ensures duplicate permission creation is blocked by uniqueness constraint.
     * @given Bearer token belonging to SuperAdmin and an existing permission name
     * @when POST /permissions request is executed
     * @then Response status should be 409 Conflict
     */
    it('should return 409 Conflict if permission name already exists', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/permissions')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: testPermissionName, description: 'Duplicate Test' })
        .expect(409);
    });
  });

  /**
   * @suite GET /permissions
   * @description Test suite for paginated permission listing endpoint.
   */
  describe('GET /permissions', () => {
    /**
     * @test
     * @description Ensures authorized caller can fetch paginated permission results.
     * @given Bearer token belonging to SuperAdmin
     * @when GET /permissions request is executed
     * @then Response status should be 200 OK with paginated data structure
     */
    it('should retrieve a paginated list of permissions', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .get('/permissions')
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
   * @suite GET /permissions/:id
   * @description Test suite for single permission retrieval endpoint.
   */
  describe('GET /permissions/:id', () => {
    /**
     * @test
     * @description Ensures single permission record can be fetched by ID.
     * @given Valid permission ID and SuperAdmin Bearer token
     * @when GET /permissions/:id request is executed
     * @then Response status should be 200 OK and match requested record
     */
    it('should fetch a single permission by ID', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .get(`/permissions/${createdPermissionId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      // Assert
      const body = response.body as { id: number; name: string };
      expect(body.id).toBe(createdPermissionId);
      expect(body.name).toBe(testPermissionName);
    });

    /**
     * @test
     * @description Ensures request fails when target permission ID does not exist.
     * @given Non-existent permission ID (999999) and SuperAdmin Bearer token
     * @when GET /permissions/:id request is executed
     * @then Response status should be 404 Not Found
     */
    it('should return 404 NotFound for non-existent permission ID', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .get('/permissions/999999')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(404);
    });
  });

  /**
   * @suite PATCH /permissions/:id
   * @description Test suite for permission updating endpoint.
   */
  describe('PATCH /permissions/:id', () => {
    /**
     * @test
     * @description Ensures existing permission details can be modified.
     * @given Valid permission ID and SuperAdmin Bearer token
     * @when PATCH /permissions/:id request is executed with new name and description
     * @then Response status should be 200 OK and reflect updated details
     */
    it('should update permission details successfully', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .patch(`/permissions/${createdPermissionId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: updatedPermissionName,
          description: 'e2e test description',
        })
        .expect(200);

      // Assert
      const body = response.body as {
        id: number;
        name: string;
        description: string;
      };
      expect(body.name).toBe(updatedPermissionName);
      expect(body.description).toBe('e2e test description');
    });
  });

  /**
   * @suite DELETE /permissions/:id
   * @description Test suite for soft-deleting permissions endpoint.
   */
  describe('DELETE /permissions/:id', () => {
    /**
     * @test
     * @description Ensures target permission is soft-deleted.
     * @given Valid permission ID and SuperAdmin Bearer token
     * @when DELETE /permissions/:id request is executed
     * @then Response status should be 200 OK
     */
    it('should soft-delete target permission', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .delete(`/permissions/${createdPermissionId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });

  /**
   * @suite PATCH /permissions/:id/restore
   * @description Test suite for restoring soft-deleted permissions endpoint.
   */
  describe('PATCH /permissions/:id/restore', () => {
    /**
     * @test
     * @description Ensures soft-deleted permission is recovered.
     * @given Soft-deleted permission ID and SuperAdmin Bearer token
     * @when PATCH /permissions/:id/restore request is executed
     * @then Response status should be 200 OK and return restored entity
     */
    it('should restore target soft-deleted permission', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .patch(`/permissions/${createdPermissionId}/restore`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      // Assert
      const body = response.body as { id: number };
      expect(body.id).toBe(createdPermissionId);
    });
  });
});
