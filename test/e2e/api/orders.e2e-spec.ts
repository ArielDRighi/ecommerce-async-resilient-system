import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { TestAppHelper, DatabaseHelper } from '../../helpers';
import { generateTestSKU } from '../../helpers/mock-data';
import { sleep } from '../../helpers/test-helpers';

describe('Orders E2E Tests', () => {
  let app: INestApplication;
  let dbHelper: DatabaseHelper;
  let accessToken: string;
  let productId: string;
  let createdOrderId: string;

  beforeAll(async () => {
    app = await TestAppHelper.createApp();
    dbHelper = new DatabaseHelper(app);
  });

  afterAll(async () => {
    // Wait for any pending saga operations to complete
    await sleep(2000);
    await dbHelper.cleanDatabase();
    await app.close();
  });

  beforeEach(async () => {
    await dbHelper.cleanDatabase();

    // Register and login to get auth token
    const userData = {
      email: `test-orders-${Date.now()}@test.com`,
      password: 'Test123!',
      firstName: 'Test',
      lastName: 'User',
    };

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userData);

    accessToken = registerResponse.body.data.data.accessToken;

    // Create a product for orders
    const productData = {
      name: 'Test Product for Orders',
      price: 99.99,
      sku: generateTestSKU(),
    };

    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(productData);

    productId = productResponse.body.data.data.id;

    // Create inventory for the product
    await request(app.getHttpServer())
      .post('/inventory')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId,
        quantity: 100,
      });
  });

  describe('POST /orders', () => {
    it('should create a new order and return 202 Accepted', async () => {
      const orderData = {
        items: [
          {
            productId,
            quantity: 2,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(orderData)
        .expect(HttpStatus.ACCEPTED);

      const { data } = response.body;
      const order = data.data;

      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('totalAmount');
      expect(order).toHaveProperty('items');
      expect(order.status).toBe('PENDING');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].productId).toBe(productId);
      expect(order.items[0].quantity).toBe(2);

      // Save order ID for other tests
      createdOrderId = order.id;
    });

    it('should create order with multiple items', async () => {
      // Create second product
      const product2Response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Second Product',
          price: 49.99,
          sku: generateTestSKU(),
        });

      const product2Id = product2Response.body.data.data.id;

      await request(app.getHttpServer())
        .post('/inventory')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          productId: product2Id,
          quantity: 50,
        });

      const orderData = {
        items: [
          { productId, quantity: 2 },
          { productId: product2Id, quantity: 1 },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(orderData)
        .expect(HttpStatus.ACCEPTED);

      const { data } = response.body;
      const order = data.data;

      expect(order.items).toHaveLength(2);
      expect(order.status).toBe('PENDING');
    });

    it('should fail to create order without authentication', async () => {
      const orderData = {
        items: [{ productId, quantity: 1 }],
      };

      await request(app.getHttpServer())
        .post('/orders')
        .send(orderData)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail to create order with empty items', async () => {
      const orderData = {
        items: [],
      };

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(orderData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create order with invalid product ID', async () => {
      const orderData = {
        items: [
          {
            productId: '00000000-0000-0000-0000-000000000000',
            quantity: 1,
          },
        ],
      };

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(orderData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create order with invalid quantity', async () => {
      const orderData = {
        items: [
          {
            productId,
            quantity: 0, // Invalid: must be at least 1
          },
        ],
      };

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(orderData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create order with negative quantity', async () => {
      const orderData = {
        items: [
          {
            productId,
            quantity: -5,
          },
        ],
      };

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(orderData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should support idempotency with custom key', async () => {
      const idempotencyKey = `test-idempotency-${Date.now()}`;
      const orderData = {
        items: [{ productId, quantity: 1 }],
        idempotencyKey,
      };

      // First request
      const response1 = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(orderData)
        .expect(HttpStatus.ACCEPTED);

      const order1 = response1.body.data.data;

      // Second request with same idempotency key
      const response2 = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(orderData)
        .expect(HttpStatus.ACCEPTED);

      const order2 = response2.body.data.data;

      // Should return the same order
      expect(order1.id).toBe(order2.id);
    });
  });

  describe('GET /orders', () => {
    beforeEach(async () => {
      // Create multiple orders
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            items: [{ productId, quantity: i + 1 }],
          });
      }
    });

    it('should list all orders for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const orders = data.data;

      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThanOrEqual(3);
      orders.forEach((order: any) => {
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('status');
        expect(order).toHaveProperty('totalAmount');
        expect(order).toHaveProperty('items');
      });
    });

    it('should return orders sorted by creation date (newest first)', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const orders = data.data;

      // Check if orders are sorted by createdAt descending
      for (let i = 1; i < orders.length; i++) {
        const prevDate = new Date(orders[i - 1].createdAt);
        const currentDate = new Date(orders[i].createdAt);
        expect(prevDate >= currentDate).toBe(true);
      }
    });

    it('should fail to list orders without authentication', async () => {
      await request(app.getHttpServer()).get('/orders').expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return empty array when user has no orders', async () => {
      // Clean database and create new user without orders
      await dbHelper.cleanDatabase();

      const newUserData = {
        email: `test-no-orders-${Date.now()}@test.com`,
        password: 'Test123!',
        firstName: 'New',
        lastName: 'User',
      };

      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(newUserData);

      const newToken = registerResponse.body.data.data.accessToken;

      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const orders = data.data;

      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBe(0);
    });
  });

  describe('GET /orders/:id', () => {
    beforeEach(async () => {
      const orderResponse = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [{ productId, quantity: 2 }],
        });

      createdOrderId = orderResponse.body.data.data.id;
    });

    it('should get order by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${createdOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const order = data.data;

      expect(order.id).toBe(createdOrderId);
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('totalAmount');
      expect(order).toHaveProperty('items');
      expect(order).toHaveProperty('createdAt');
    });

    it('should return 404 for non-existent order', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .get(`/orders/${nonExistentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .get('/orders/invalid-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to get order without authentication', async () => {
      await request(app.getHttpServer())
        .get(`/orders/${createdOrderId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should not allow user to access another users order', async () => {
      // Create second user
      const user2Data = {
        email: `test-user2-${Date.now()}@test.com`,
        password: 'Test123!',
        firstName: 'User',
        lastName: 'Two',
      };

      const user2Response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user2Data);

      const user2Token = user2Response.body.data.data.accessToken;

      // Try to access first user's order with second user's token
      await request(app.getHttpServer())
        .get(`/orders/${createdOrderId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /orders/:id/status', () => {
    beforeEach(async () => {
      const orderResponse = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [{ productId, quantity: 1 }],
        });

      createdOrderId = orderResponse.body.data.data.id;
    });

    it('should get order status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const statusResponse = data.data;

      expect(statusResponse).toHaveProperty('orderId');
      expect(statusResponse).toHaveProperty('status');
      expect(statusResponse.orderId).toBe(createdOrderId);
      expect(statusResponse.status).toBeDefined();
    });

    it('should return current order status (PENDING initially)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const statusResponse = data.data;

      expect(statusResponse.status).toBe('PENDING');
    });

    it('should return 404 for non-existent order', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .get(`/orders/${nonExistentId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail to get status without authentication', async () => {
      await request(app.getHttpServer())
        .get(`/orders/${createdOrderId}/status`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should be lightweight (not include full order details)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const statusResponse = data.data;

      // Should only have orderId and status, not items or other details
      expect(statusResponse).toHaveProperty('orderId');
      expect(statusResponse).toHaveProperty('status');
      expect(statusResponse).not.toHaveProperty('items');
      expect(statusResponse).not.toHaveProperty('totalAmount');
    });
  });

  describe('Order Processing Flow', () => {
    it('should process order asynchronously', async () => {
      const orderData = {
        items: [{ productId, quantity: 1 }],
      };

      // Create order
      const createResponse = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(orderData)
        .expect(HttpStatus.ACCEPTED);

      const orderId = createResponse.body.data.data.id;
      const initialStatus = createResponse.body.data.data.status;

      expect(initialStatus).toBe('PENDING');

      // Wait a bit for async processing (in real scenario)
      await sleep(100);

      // Check status - may still be PENDING or could have progressed
      const statusResponse = await request(app.getHttpServer())
        .get(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const currentStatus = statusResponse.body.data.data.status;

      // Status should be one of the valid order statuses
      const validStatuses = [
        'PENDING',
        'PROCESSING',
        'PAYMENT_PENDING',
        'PAYMENT_FAILED',
        'CONFIRMED',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED',
        'REFUNDED',
      ];

      expect(validStatuses).toContain(currentStatus);
    });
  });
});
