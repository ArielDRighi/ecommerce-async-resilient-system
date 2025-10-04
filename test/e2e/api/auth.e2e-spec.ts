import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestAppHelper, DatabaseHelper } from '../../helpers';

/**
 * Authentication E2E Tests
 * Verifica todos los endpoints de autenticación
 */
describe('Authentication (E2E)', () => {
  let app: INestApplication;
  let dbHelper: DatabaseHelper;

  beforeAll(async () => {
    app = await TestAppHelper.createApp();
    dbHelper = new DatabaseHelper(app);
  });

  afterAll(async () => {
    await dbHelper.cleanDatabase();
    await app.close();
  });

  afterEach(async () => {
    // Limpiar usuarios creados en cada test
    await dbHelper.cleanDatabase();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      // Verificar estructura de respuesta (envuelta por ResponseInterceptor)
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('statusCode', 201);
      expect(response.body).toHaveProperty('data');

      // Verificar datos del usuario (ResponseInterceptor wraps response in data)
      const { data } = response.body;
      const authData = data.data; // El AuthResponseDto está en data.data
      expect(authData).toHaveProperty('user');
      expect(authData).toHaveProperty('accessToken');
      expect(authData).toHaveProperty('refreshToken');

      expect(authData.user.email).toBe(userData.email.toLowerCase());
      expect(authData.user.firstName).toBe(userData.firstName);
      expect(authData.user.lastName).toBe(userData.lastName);
      expect(authData.user).toHaveProperty('id');
      expect(authData.user).not.toHaveProperty('password');

      expect(typeof authData.accessToken).toBe('string');
      expect(typeof authData.refreshToken).toBe('string');
    });

    it('should fail with invalid email format', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'SecurePassword123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should fail with weak password', async () => {
      const userData = {
        email: `test-${Date.now()}@example.com`,
        password: 'weak',
        firstName: 'John',
        lastName: 'Doe',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should fail with duplicate email', async () => {
      const userData = {
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      // Primer registro exitoso
      await request(app.getHttpServer()).post('/auth/register').send(userData).expect(201);

      // Segundo registro con mismo email debe fallar
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 409);
    });

    it('should fail with missing required fields', async () => {
      const userData = {
        email: `test-${Date.now()}@example.com`,
        // password missing
        firstName: 'John',
        lastName: 'Doe',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  describe('POST /auth/login', () => {
    const testUser = {
      email: `test-login-${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      firstName: 'Login',
      lastName: 'User',
    };

    beforeEach(async () => {
      // Crear usuario para tests de login
      await request(app.getHttpServer()).post('/auth/register').send(testUser).expect(201);
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('statusCode', 200);
      expect(response.body).toHaveProperty('data');

      const { data } = response.body;
      const authData = data.data; // El AuthResponseDto está en data.data
      expect(authData).toHaveProperty('user');
      expect(authData).toHaveProperty('accessToken');
      expect(authData).toHaveProperty('refreshToken');

      expect(authData.user.email).toBe(testUser.email.toLowerCase());
    });

    it('should fail with invalid password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should fail with non-existent email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'AnyPassword123!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should fail with missing credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          // password missing
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  describe('GET /auth/profile', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      // Crear y autenticar usuario
      const userData = {
        email: `test-profile-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
        firstName: 'Profile',
        lastName: 'User',
      };

      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      accessToken = registerResponse.body.data.data.accessToken;
      userId = registerResponse.body.data.data.user.id;
    });

    it('should get user profile with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');

      const { data } = response.body;
      const profileData = data.data; // Double-wrapped by ResponseInterceptor
      expect(profileData.id).toBe(userId);
      expect(profileData).toHaveProperty('email');
      expect(profileData).toHaveProperty('firstName');
      expect(profileData).toHaveProperty('lastName');
      expect(profileData).toHaveProperty('fullName');
      expect(profileData).toHaveProperty('isActive');
      expect(profileData).not.toHaveProperty('password');
    });

    it('should fail without authorization header', async () => {
      const response = await request(app.getHttpServer()).get('/auth/profile').expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should fail with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token-xyz')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 401);
    });
  });

  describe('GET /auth/me', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      const userData = {
        email: `test-me-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
        firstName: 'Me',
        lastName: 'User',
      };

      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      accessToken = registerResponse.body.data.data.accessToken;
      userId = registerResponse.body.data.data.user.id;
    });

    it('should get minimal user info with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');

      const { data } = response.body;
      const meData = data.data; // Double-wrapped by ResponseInterceptor
      expect(meData.id).toBe(userId);
      expect(meData).toHaveProperty('email');
      expect(meData).toHaveProperty('firstName');
      expect(meData).toHaveProperty('lastName');
      expect(meData).toHaveProperty('fullName');
      expect(meData).toHaveProperty('isActive');
      expect(meData).not.toHaveProperty('password');
    });

    it('should fail without authorization header', async () => {
      const response = await request(app.getHttpServer()).get('/auth/me').expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 401);
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const userData = {
        email: `test-refresh-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
        firstName: 'Refresh',
        lastName: 'User',
      };

      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      refreshToken = registerResponse.body.data.data.refreshToken;
    });

    it('should refresh tokens successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');

      const { data } = response.body;
      const authData = data.data;
      expect(authData).toHaveProperty('accessToken');
      expect(authData).toHaveProperty('refreshToken');
      expect(authData).toHaveProperty('user');

      // Los nuevos tokens deben ser diferentes
      expect(authData.accessToken).not.toBe(refreshToken);
      expect(typeof authData.accessToken).toBe('string');
      expect(typeof authData.refreshToken).toBe('string');
    });

    it('should fail with invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token-xyz' })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should fail without refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  describe('POST /auth/logout', () => {
    let accessToken: string;

    beforeEach(async () => {
      const userData = {
        email: `test-logout-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
        firstName: 'Logout',
        lastName: 'User',
      };

      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      accessToken = registerResponse.body.data.data.accessToken;
    });

    it('should logout successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');

      const { data } = response.body;
      expect(data).toHaveProperty('message');
      expect(data.success).toBe(true);
    });

    it('should fail without authorization header', async () => {
      const response = await request(app.getHttpServer()).post('/auth/logout').expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', 401);
    });
  });
});
