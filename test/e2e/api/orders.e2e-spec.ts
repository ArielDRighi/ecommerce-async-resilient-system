import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import request from 'supertest';
import { generateTestEmail, generateTestSKU } from '../../helpers/mock-data';

/**
 * Orders API E2E Tests
 * Category: API Tests
 * Purpose: Test order management endpoints
 */
describe('Orders API (E2E)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let userId: string;
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

    // Register admin user
    const adminResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: generateTestEmail(),
      password: 'AdminPassword123!',
      firstName: 'Admin',
      lastName: 'User',
    });
    adminToken = adminResponse.body.data.accessToken;

    // Register regular user
    const userResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: generateTestEmail(),
      password: 'UserPassword123!',
      firstName: 'Test',
      lastName: 'User',
    });
    userToken = userResponse.body.data.accessToken;
    userId = userResponse.body.data.user.id;

    // Create a product
    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Product',
        description: 'Product for order testing',
        price: 99.99,
        sku: generateTestSKU(),
      })
      .expect(201);

    productId = productResponse.body.data.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /orders', () => {
    it('should create a new order', async () => {
      const createOrderDto = {
        items: [
          {
            productId: productId,
            quantity: 2,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createOrderDto)
        .expect(202); // Async processing

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data.userId).toBe(userId);

      orderId = response.body.data.id;
    });

    it('should fail to create order without items', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [],
        })
        .expect(400);
    });

    it('should fail to create order with invalid product', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          items: [
            {
              productId: '00000000-0000-0000-0000-000000000000',
              quantity: 1,
            },
          ],
        })
        .expect(404);
    });

    it('should fail to create order without authentication', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({
          items: [
            {
              productId: productId,
              quantity: 1,
            },
          ],
        })
        .expect(401);
    });
  });

  describe('GET /orders', () => {
    it('should get user orders with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('meta');
      expect(Array.isArray(response.body.data.data)).toBe(true);
    });

    it('should filter orders by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ status: 'PENDING' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET /orders/:id', () => {
    it('should get order by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.id).toBe(orderId);
      expect(response.body.data.userId).toBe(userId);
    });

    it('should return 404 for non-existent order', async () => {
      await request(app.getHttpServer())
        .get('/orders/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });

    it('should prevent users from viewing other users orders', async () => {
      // Create another user
      const otherUserResponse = await request(app.getHttpServer()).post('/auth/register').send({
        email: generateTestEmail(),
        password: 'OtherPassword123!',
        firstName: 'Other',
        lastName: 'User',
      });
      const otherUserToken = otherUserResponse.body.data.accessToken;

      // Try to access first user's order
      await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);
    });
  });

  describe('PATCH /orders/:id/cancel', () => {
    it('should cancel an order', async () => {
      // Create a new order to cancel
      const createResponse = await request(app.getHttpServer())
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

      const newOrderId = createResponse.body.data.id;

      // Cancel the order
      const cancelResponse = await request(app.getHttpServer())
        .patch(`/orders/${newOrderId}/cancel`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(cancelResponse.body).toHaveProperty('success', true);
      expect(cancelResponse.body.data.status).toBe('CANCELLED');
    });

    it('should fail to cancel non-existent order', async () => {
      await request(app.getHttpServer())
        .patch('/orders/00000000-0000-0000-0000-000000000000/cancel')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });

  describe('PATCH /orders/:id/status', () => {
    it('should update order status (admin only)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'CONFIRMED',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.status).toBe('CONFIRMED');
    });

    it('should fail to update status without admin role', async () => {
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          status: 'CONFIRMED',
        })
        .expect(403);
    });
  });

  describe('GET /orders/:id/tracking', () => {
    it('should get order tracking information', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}/tracking`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('orderId', orderId);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('history');
      expect(Array.isArray(response.body.data.history)).toBe(true);
    });
  });

  describe('POST /orders/:id/retry-payment', () => {
    it('should retry payment for failed order', async () => {
      // Create an order
      const createResponse = await request(app.getHttpServer())
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

      const paymentOrderId = createResponse.body.data.id;

      // Retry payment
      const response = await request(app.getHttpServer())
        .post(`/orders/${paymentOrderId}/retry-payment`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });
});
