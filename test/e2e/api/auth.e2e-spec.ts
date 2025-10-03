import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { generateTestEmail } from '../../helpers/mock-data';

/**
 * Authentication API E2E Tests
 * Category: API Tests
 * Purpose: Test authentication endpoints functionality
 */
describe('Authentication API (E2E)', () => {
  let app: INestApplication;
  const testEmail = generateTestEmail();
  const testPassword = 'StrongPassword123!';
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = {
        email: testEmail,
        password: testPassword,
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe(testEmail);
      expect(response.body.data.user).not.toHaveProperty('passwordHash');

      // Save tokens for later tests
      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('should fail to register with duplicate email', async () => {
      const duplicateDto = {
        email: testEmail,
        password: 'AnotherPassword123!',
        firstName: 'Another',
        lastName: 'User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(duplicateDto)
        .expect(409);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('already exists');
    });

    it('should fail with invalid email format', async () => {
      const invalidDto = {
        email: 'not-an-email',
        password: testPassword,
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app.getHttpServer()).post('/auth/register').send(invalidDto).expect(400);
    });

    it('should fail with weak password', async () => {
      const weakPasswordDto = {
        email: generateTestEmail(),
        password: '123',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app.getHttpServer()).post('/auth/register').send(weakPasswordDto).expect(400);
    });

    it('should fail with missing required fields', async () => {
      const incompleteDto = {
        email: generateTestEmail(),
        // Missing password, firstName, lastName
      };

      await request(app.getHttpServer()).post('/auth/register').send(incompleteDto).expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      const loginDto = {
        email: testEmail,
        password: testPassword,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe(testEmail);
    });

    it('should fail with incorrect password', async () => {
      const wrongPasswordDto = {
        email: testEmail,
        password: 'WrongPassword123!',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(wrongPasswordDto)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail with non-existent email', async () => {
      const nonExistentDto = {
        email: 'nonexistent@example.com',
        password: testPassword,
      };

      await request(app.getHttpServer()).post('/auth/login').send(nonExistentDto).expect(401);
    });

    it('should fail with missing credentials', async () => {
      await request(app.getHttpServer()).post('/auth/login').send({}).expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const refreshDto = {
        refreshToken: refreshToken,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send(refreshDto)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should fail with invalid refresh token', async () => {
      const invalidRefreshDto = {
        refreshToken: 'invalid-token',
      };

      await request(app.getHttpServer()).post('/auth/refresh').send(invalidRefreshDto).expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET /auth/me', () => {
    it('should get current user profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.email).toBe(testEmail);
    });

    it('should fail without authentication token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('should fail with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
