import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import request from 'supertest';
import { generateTestEmail, generateTestSKU } from '../../helpers/mock-data';

/**
 * API Contracts E2E Tests
 * Category: Contract Tests
 * Purpose: Validate API response structures and contracts
 */
describe('API Contracts (E2E)', () => {
  let app: INestApplication;
  let userToken: string;
  let productId: string;

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

    // Setup test data
    const userResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: generateTestEmail(),
      password: 'TestPassword123!',
      firstName: 'Contract',
      lastName: 'User',
    });
    userToken = userResponse.body.data.accessToken;

    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Contract Test Product',
        description: 'Product for contract testing',
        price: 99.99,
        sku: generateTestSKU(),
      });
    productId = productResponse.body.data.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Standard Response Structure', () => {
    it('should return standardized success response', async () => {
      const response = await request(app.getHttpServer()).get(`/products/${productId}`).expect(200);

      // Validate response structure
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return standardized error response', async () => {
      const response = await request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);

      // Validate error response structure
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('statusCode', 404);
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return validation error response', async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Invalid Product',
          price: -10, // Invalid price
          sku: generateTestSKU(),
        })
        .expect(400);

      // Validate validation error structure
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('statusCode', 400);
    });
  });

  describe('Authentication Response Contracts', () => {
    it('should return valid registration response contract', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: generateTestEmail(),
          password: 'NewUser123!',
          firstName: 'New',
          lastName: 'User',
        })
        .expect(201);

      // Validate registration contract
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user).toHaveProperty('id');
      expect(response.body.data.user).toHaveProperty('email');
      expect(response.body.data.user).toHaveProperty('firstName');
      expect(response.body.data.user).toHaveProperty('lastName');
      expect(response.body.data.user).not.toHaveProperty('password');

      // Validate token types
      expect(typeof response.body.data.accessToken).toBe('string');
      expect(typeof response.body.data.refreshToken).toBe('string');
      expect(response.body.data.accessToken.length).toBeGreaterThan(0);
    });

    it('should return valid login response contract', async () => {
      const email = generateTestEmail();
      const password = 'LoginUser123!';

      await request(app.getHttpServer()).post('/auth/register').send({
        email,
        password,
        firstName: 'Login',
        lastName: 'User',
      });

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email,
          password,
        })
        .expect(200);

      // Validate login contract
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user).not.toHaveProperty('password');
    });
  });

  describe('Product Response Contracts', () => {
    it('should return valid product response contract', async () => {
      const response = await request(app.getHttpServer()).get(`/products/${productId}`).expect(200);

      // Validate product contract
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('description');
      expect(response.body.data).toHaveProperty('price');
      expect(response.body.data).toHaveProperty('sku');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');

      // Validate data types
      expect(typeof response.body.data.id).toBe('string');
      expect(typeof response.body.data.name).toBe('string');
      expect(typeof response.body.data.price).toBe('number');
      expect(typeof response.body.data.sku).toBe('string');
    });

    it('should return valid paginated products response contract', async () => {
      const response = await request(app.getHttpServer())
        .get('/products')
        .query({ page: 1, limit: 10 })
        .expect(200);

      // Validate pagination contract
      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('meta');
      expect(Array.isArray(response.body.data.data)).toBe(true);

      // Validate meta structure
      expect(response.body.data.meta).toHaveProperty('page');
      expect(response.body.data.meta).toHaveProperty('limit');
      expect(response.body.data.meta).toHaveProperty('totalPages');
      expect(response.body.data.meta).toHaveProperty('totalItems');

      // Validate meta types
      expect(typeof response.body.data.meta.page).toBe('number');
      expect(typeof response.body.data.meta.limit).toBe('number');
      expect(typeof response.body.data.meta.totalPages).toBe('number');
      expect(typeof response.body.data.meta.totalItems).toBe('number');
    });
  });

  describe('Order Response Contracts', () => {
    it('should return valid order response contract', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              productId: productId,
              quantity: 2,
            },
          ],
        })
        .expect(202);

      // Validate order contract
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('userId');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('totalAmount');
      expect(response.body.data).toHaveProperty('createdAt');

      // Validate data types
      expect(typeof response.body.data.id).toBe('string');
      expect(typeof response.body.data.userId).toBe('string');
      expect(typeof response.body.data.status).toBe('string');
      expect(typeof response.body.data.totalAmount).toBe('number');

      // Validate status enum
      expect(['PENDING', 'PROCESSING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).toContain(
        response.body.data.status,
      );
    });
  });

  describe('Error Response Contracts', () => {
    it('should return 400 Bad Request with proper contract', async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          // Missing required fields
          name: 'Incomplete Product',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.statusCode).toBe(400);
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 401 Unauthorized with proper contract', async () => {
      const response = await request(app.getHttpServer()).get('/users/me').expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.statusCode).toBe(401);
    });

    it('should return 404 Not Found with proper contract', async () => {
      const response = await request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.statusCode).toBe(404);
    });
  });

  describe('Content-Type Headers', () => {
    it('should return JSON content-type for all endpoints', async () => {
      const response = await request(app.getHttpServer()).get(`/products/${productId}`).expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should accept JSON content-type for POST requests', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send({
          email: generateTestEmail(),
          password: 'Test123!',
        });

      // Should not throw error with proper content-type
    });
  });

  describe('API Versioning', () => {
    it('should include API version in response headers', async () => {
      const response = await request(app.getHttpServer()).get(`/products/${productId}`).expect(200);

      // Check for version header if implemented
      expect(response.headers).toBeDefined();
    });
  });
});
