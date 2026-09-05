jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('MOCK_SECRET_KEY_12345'),
  generateURI: jest
    .fn()
    .mockReturnValue('otpauth://totp/Test:user?secret=MOCK_SECRET_KEY_12345'),
  verify: jest.fn().mockReturnValue(false),
}));

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
import { CaptchaService } from 'src/modules/auth/captcha.service';
import { MailService } from 'src/modules/mail/mail.service';
import { DeviceService } from 'src/modules/auth/device.service';
import { JwtService } from '@nestjs/jwt';
import { AuthTestHelper } from './helpers/auth-test.helper';

/**
 * @file auth.e2e-spec.ts
 * @description End-to-End integration test suite for AuthController endpoints.
 * Validates registration, authentication, 2FA setup/verification, and password recovery.
 */
describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let superAdminToken: string;
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

  // Dynamic credentials to prevent 409 database collisions across runs
  const testAuthEmail = `auth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`;
  const testAuthUsername = `auth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

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
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /**
   * @suite POST /auth/register
   * @description Test suite for standard user account registration.
   */
  describe('POST /auth/register', () => {
    /**
     * @test
     * @description Ensures a new standard user can register successfully without leaking sensitive data.
     * @given Valid registration DTO and mock captcha token
     * @when POST /auth/register request is executed
     * @then Response status should be 201 Created and return user entity with sanitized credentials
     */
    it('should register a new standard user account successfully', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .post('/auth/register')
        .send({
          email: testAuthEmail,
          username: testAuthUsername,
          password: 'Password123!',
          captchaToken: 'mock_captcha_token',
        })
        .expect(201);

      // Assert: Body structure and fields
      const body = response.body as Record<string, unknown>;
      expect(body).toHaveProperty('id');
      expect(body.email).toBe(testAuthEmail);
      expect(body.username).toBe(testAuthUsername);

      // Security assertion: Password and private recovery codes must NOT be exposed
      expect(body.password).toBeUndefined();
      expect(body.twoFactorSecret).toBeUndefined();
      expect(body.passwordResetCode).toBeUndefined();

      // Service interaction assertion
      expect(mockCaptchaService.verify).toHaveBeenCalledWith(
        'mock_captcha_token',
      );

      createdUserId = body.id as number;
    });

    /**
     * @test
     * @description Ensures registration fails when required validation fields are missing.
     * @given Incomplete registration payload
     * @when POST /auth/register request is executed
     * @then Response status should be 400 Bad Request
     */
    it('should return 400 Bad Request if email is invalid or missing', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          username: `user_${Date.now()}`,
          password: 'Password123!',
        })
        .expect(400);
    });
  });

  /**
   * @suite POST /auth/login
   * @description Test suite for standard user authentication.
   */
  describe('POST /auth/login', () => {
    /**
     * @test
     * @description Ensures authentication fails when invalid credentials are provided.
     * @given Registered email with incorrect password
     * @when POST /auth/login request is executed
     * @then Response status should be 401 Unauthorized
     */
    it('should return 401 Unauthorized if password is incorrect', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/auth/login')
        .send({
          email: testAuthEmail,
          password: 'WrongPassword123!',
          captchaToken: 'mock_captcha_token',
        })
        .expect(401);
    });

    /**
     * @test
     * @description Ensures standard user can authenticate and receive valid JWT tokens.
     * @given Valid email and password
     * @when POST /auth/login request is executed
     * @then Response status should be 201 Created returning valid access and refresh JWT pairs
     */
    it('should authenticate user and return access and refresh tokens', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .post('/auth/login')
        .send({
          email: testAuthEmail,
          password: 'Password123!',
          captchaToken: 'mock_captcha_token',
        })
        .expect(201);

      // Assert
      const body = response.body as {
        accessToken: string;
        refreshToken: string;
      };
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');

      // Assert JWT 3-part format (header.payload.signature)
      const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
      expect(body.accessToken).toMatch(jwtPattern);
      expect(body.refreshToken).toMatch(jwtPattern);

      // Assert Captcha validation was executed
      expect(mockCaptchaService.verify).toHaveBeenCalled();
    });
  });

  /**
   * @suite POST /auth/2fa/generate & POST /auth/2fa/verify
   * @description Test suite for two-factor authentication initialization.
   */
  describe('2FA Operations', () => {
    /**
     * @test
     * @description Ensures authorized user can generate a 2FA secret and QR code.
     * @given SuperAdmin Bearer token and user ID
     * @when POST /auth/2fa/generate request is executed
     * @then Response status should be 201 Created with secret and qrCode URI
     */
    it('should generate 2FA secret and return QR code data URL', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .post('/auth/2fa/generate')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ userId: createdUserId })
        .expect(201);

      // Assert
      const body = response.body as {
        secret: string;
        qrCode: string;
        uri: string;
      };
      expect(body).toHaveProperty('secret');
      expect(body).toHaveProperty('qrCode');
      expect(body).toHaveProperty('uri');

      // Assert valid secret string and Data URL schema
      expect(typeof body.secret).toBe('string');
      expect(body.secret.length).toBeGreaterThan(0);
      expect(body.qrCode).toMatch(/^data:image\/(png|jpeg);base64,/);
      expect(body.uri).toContain('otpauth://totp/');
    });

    /**
     * @test
     * @description Ensures 2FA verification fails for invalid TOTP tokens.
     * @given Registered user ID and non-matching 2FA token
     * @when POST /auth/2fa/verify request is executed
     * @then Response status should be 401 Unauthorized
     */
    it('should return 401 Unauthorized when verifying an invalid TOTP token', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/auth/2fa/verify')
        .send({
          userId: createdUserId,
          token: '000000',
          accountType: 'user',
        })
        .expect(401);
    });
  });

  /**
   * @suite Password Recovery Workflows
   * @description Test suite for forgot-password and reset-password endpoints.
   */
  describe('Password Recovery', () => {
    /**
     * @test
     * @description Ensures forgot password triggers recovery email workflow with token.
     * @given Registered account email
     * @when POST /auth/forgot-password request is executed
     * @then Response status should be 201 Created and MailService is invoked
     */
    it('should trigger password recovery flow for registered email', async () => {
      // Act
      const response = await request(app.getHttpServer() as unknown as Express)
        .post('/auth/forgot-password')
        .send({ email: testAuthEmail })
        .expect(201);

      // Assert
      const body = response.body as { message: string };
      expect(body).toHaveProperty('message');

      // Assert that MailService was invoked with target email and reset token URL
      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        testAuthEmail,
        expect.any(String), // The shortcode
        expect.stringContaining('token='), // The reset URL
      );
    });

    /**
     * @test
     * @description Ensures reset password rejects invalid or expired reset codes.
     * @given Invalid reset code
     * @when POST /auth/reset-password request is executed
     * @then Response status should be 400 Bad Request
     */
    it('should return 400 Bad Request when resetting password with invalid code', () => {
      // Act & Assert
      return request(app.getHttpServer() as unknown as Express)
        .post('/auth/reset-password')
        .send({
          email: testAuthEmail,
          code: 'INVALID_CODE',
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!',
        })
        .expect(400);
    });
  });
});
