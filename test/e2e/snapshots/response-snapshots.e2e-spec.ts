import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import request from 'supertest';
import { generateTestEmail, generateTestSKU } from '../../helpers/mock-data';

/**
 * Response Snapshots E2E Tests
 * Category: Snapshot Tests
 * Purpose: Validate response structure consistency using Jest snapshots
 */
describe('Response Snapshots (E2E)', () => {
  let app: INestApplication;
  let userToken: string;
  let productId: string;
  let orderId: string;

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
      firstName: 'Snapshot',
      lastName: 'User',
    });
    userToken = userResponse.body.data.accessToken;

    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Snapshot Test Product',
        description: 'Product for snapshot testing',
        price: 99.99,
        sku: generateTestSKU(),
        brand: 'TestBrand',
        weight: 1.5,
      });
    productId = productResponse.body.data.id;

    const orderResponse = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        items: [
          {
            productId: productId,
            quantity: 2,
          },
        ],
      });
    orderId = orderResponse.body.data.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Authentication Response Snapshots', () => {
    it('should match registration response structure', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: generateTestEmail(),
          password: 'NewUser123!',
          firstName: 'New',
          lastName: 'User',
        })
        .expect(201);

      // Normalize dynamic fields
      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        data: {
          ...response.body.data,
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          user: {
            ...response.body.data.user,
            id: expect.any(String),
            email: expect.any(String),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          },
        },
      };

      expect(normalized).toMatchSnapshot();
    });

    it('should match login response structure', async () => {
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

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        data: {
          ...response.body.data,
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          user: {
            ...response.body.data.user,
            id: expect.any(String),
            email: expect.any(String),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            lastLoginAt: expect.any(String),
          },
        },
      };

      expect(normalized).toMatchSnapshot();
    });
  });

  describe('Product Response Snapshots', () => {
    it('should match product detail response structure', async () => {
      const response = await request(app.getHttpServer()).get(`/products/${productId}`).expect(200);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        path: expect.any(String),
        data: {
          ...response.body.data,
          id: expect.any(String),
          sku: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      };

      expect(normalized).toMatchSnapshot();
    });

    it('should match product list response structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/products')
        .query({ page: 1, limit: 10 })
        .expect(200);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: response.body.data.data.map((product: any) => ({
            ...product,
            id: expect.any(String),
            sku: expect.any(String),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          })),
          meta: {
            ...response.body.data.meta,
            totalItems: expect.any(Number),
          },
        },
      };

      expect(normalized).toMatchSnapshot();
    });

    it('should match product creation response structure', async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'New Snapshot Product',
          description: 'Product created for snapshot',
          price: 149.99,
          sku: generateTestSKU(),
        })
        .expect(201);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        data: {
          ...response.body.data,
          id: expect.any(String),
          sku: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      };

      expect(normalized).toMatchSnapshot();
    });
  });

  describe('Order Response Snapshots', () => {
    it('should match order detail response structure', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        path: expect.any(String),
        data: {
          ...response.body.data,
          id: expect.any(String),
          userId: expect.any(String),
          idempotencyKey: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: response.body.data.items?.map((item: any) => ({
            ...item,
            id: expect.any(String),
            productId: expect.any(String),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          })),
        },
      };

      expect(normalized).toMatchSnapshot();
    });

    it('should match order list response structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data:
            response.body.data.data?.map((order: any) => ({
              ...order,
              id: expect.any(String),
              userId: expect.any(String),
              idempotencyKey: expect.any(String),
              createdAt: expect.any(String),
              updatedAt: expect.any(String),
            })) || [],
          meta: {
            ...response.body.data.meta,
            totalItems: expect.any(Number),
          },
        },
      };

      expect(normalized).toMatchSnapshot();
    });

    it('should match order creation response structure', async () => {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              productId: productId,
              quantity: 1,
            },
          ],
        })
        .expect(202);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        data: {
          ...response.body.data,
          id: expect.any(String),
          userId: expect.any(String),
          idempotencyKey: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items:
            response.body.data.items?.map((item: any) => ({
              ...item,
              id: expect.any(String),
              productId: expect.any(String),
            })) || [],
        },
      };

      expect(normalized).toMatchSnapshot();
    });
  });

  describe('User Response Snapshots', () => {
    it('should match user profile response structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        data: {
          ...response.body.data,
          id: expect.any(String),
          email: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          lastLoginAt: expect.any(String),
        },
      };

      expect(normalized).toMatchSnapshot();
    });
  });

  describe('Error Response Snapshots', () => {
    it('should match 400 Bad Request error structure', async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Invalid Product',
          price: -10,
        })
        .expect(400);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        correlationId: expect.any(String),
        error: {
          ...response.body.error,
          message: expect.any(String),
        },
      };

      expect(normalized).toMatchSnapshot();
    });

    it('should match 401 Unauthorized error structure', async () => {
      const response = await request(app.getHttpServer()).get('/users/me').expect(401);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        error: {
          ...response.body.error,
          message: expect.any(String),
        },
      };

      expect(normalized).toMatchSnapshot();
    });

    it('should match 404 Not Found error structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        correlationId: expect.any(String),
        error: {
          ...response.body.error,
          message: expect.any(String),
        },
      };

      expect(normalized).toMatchSnapshot();
    });
  });

  describe('Pagination Response Snapshots', () => {
    it('should match pagination metadata structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/products')
        .query({ page: 2, limit: 5 })
        .expect(200);

      const normalized = {
        meta: {
          ...response.body.data.meta,
          totalItems: expect.any(Number),
        },
      };

      expect(normalized).toMatchSnapshot();
    });
  });

  describe('Health Check Response Snapshots', () => {
    it('should match health check response structure', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      const normalized = {
        ...response.body,
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: {
          used: expect.any(Number),
          total: expect.any(Number),
        },
      };

      expect(normalized).toMatchSnapshot();
    });
  });
});
