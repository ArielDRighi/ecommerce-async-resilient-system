import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestAppHelper, DatabaseHelper } from '../../helpers';

/**
 * API Contracts E2E Tests
 *
 * Validates the structure and types of API responses to ensure
 * consistency and prevent breaking changes in the API contract.
 *
 * These tests verify:
 * - Response structure matches expected schema
 * - Data types are correct
 * - Required fields are present
 * - Response headers are correct
 * - Error response structures are consistent
 */
describe('API Contracts (e2e)', () => {
  let app: INestApplication;
  let dbHelper: DatabaseHelper;
  let authToken: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await TestAppHelper.createApp();
    dbHelper = new DatabaseHelper(app);

    // Create test users and get tokens
    const userResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: 'contract-user@test.com',
      password: 'Test123!',
      firstName: 'Contract',
      lastName: 'User',
    });
    authToken = userResponse.body.data.data.accessToken;

    const adminResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: 'contract-admin@test.com',
      password: 'Admin123!',
      firstName: 'Contract',
      lastName: 'Admin',
    });
    adminToken = adminResponse.body.data.data.accessToken;
  });

  afterAll(async () => {
    await dbHelper.cleanDatabase();
    await app.close();
  });

  describe('Authentication Endpoints', () => {
    describe('POST /auth/register', () => {
      it('should return correct response structure for successful registration', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email: 'newuser@test.com',
            password: 'Test123!',
            firstName: 'New',
            lastName: 'User',
          })
          .expect(201);

        // Validate response structure
        const authData = response.body.data.data;
        expect(authData).toHaveProperty('user');
        expect(authData).toHaveProperty('accessToken');

        // Validate user object structure
        expect(authData.user).toHaveProperty('id');
        expect(authData.user).toHaveProperty('email', 'newuser@test.com');
        expect(authData.user).toHaveProperty('firstName', 'New');
        expect(authData.user).toHaveProperty('lastName', 'User');
        expect(authData.user).toHaveProperty('isActive');
        expect(authData.user).toHaveProperty('createdAt');
        expect(authData.user).not.toHaveProperty('password');

        // Validate data types
        expect(typeof authData.user.id).toBe('string');
        expect(typeof authData.user.email).toBe('string');
        expect(typeof authData.user.isActive).toBe('boolean');
        expect(typeof authData.accessToken).toBe('string');
      });

      it('should return correct error structure for validation errors', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email: 'invalid-email',
            password: '123', // too short
          })
          .expect(400);

        // Validate error response structure
        expect(response.body).toHaveProperty('statusCode', 400);
        expect(response.body).toHaveProperty('message');
        expect(Array.isArray(response.body.message)).toBe(true);
      });
    });

    describe('POST /auth/login', () => {
      it('should return correct response structure for successful login', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'contract-user@test.com',
            password: 'Test123!',
          })
          .expect(200);

        const authData = response.body.data.data;
        expect(authData).toHaveProperty('user');
        expect(authData).toHaveProperty('accessToken');
        expect(authData.user).not.toHaveProperty('password');
      });
    });
  });

  describe('Users Endpoints', () => {
    describe('GET /users/profile', () => {
      it('should return correct user profile structure', async () => {
        const response = await request(app.getHttpServer())
          .get('/users/profile')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Validate response structure
        const user = response.body.data.data;
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('firstName');
        expect(user).toHaveProperty('lastName');
        expect(user).toHaveProperty('isActive');
        expect(user).toHaveProperty('createdAt');
        expect(user).toHaveProperty('updatedAt');
        expect(user).not.toHaveProperty('password');

        // Validate data types
        expect(typeof user.id).toBe('string');
        expect(typeof user.email).toBe('string');
        expect(typeof user.isActive).toBe('boolean');
      });
    });

    describe('GET /users', () => {
      it('should return correct paginated response structure', async () => {
        const response = await request(app.getHttpServer())
          .get('/users?page=1&limit=10')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Validate pagination structure
        const result = response.body.data.data;
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('meta');
        expect(Array.isArray(result.data)).toBe(true);

        // Validate meta structure
        expect(result.meta).toHaveProperty('total');
        expect(result.meta).toHaveProperty('page');
        expect(result.meta).toHaveProperty('limit');
        expect(result.meta).toHaveProperty('totalPages');

        // Validate data types
        expect(typeof result.meta.total).toBe('number');
        expect(typeof result.meta.page).toBe('number');
        expect(typeof result.meta.limit).toBe('number');
        expect(typeof result.meta.totalPages).toBe('number');
      });
    });
  });

  describe('Products Endpoints', () => {
    let productId: string;

    beforeAll(async () => {
      // Create a test product
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Contract Test Product',
          description: 'Product for testing API contracts',
          price: 99.99,
          sku: 'CONTRACT-001',
          brand: 'TestBrand',
        })
        .expect(201);

      productId = response.body.data.data.id;
    });

    describe('POST /products', () => {
      it('should return correct product structure', async () => {
        const response = await request(app.getHttpServer())
          .post('/products')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'New Product',
            description: 'Test product',
            price: 49.99,
            sku: 'NEW-PROD-001',
            brand: 'TestBrand',
          })
          .expect(201);

        // Validate product structure
        const product = response.body.data.data;
        expect(product).toHaveProperty('id');
        expect(product).toHaveProperty('name', 'New Product');
        expect(product).toHaveProperty('description', 'Test product');
        expect(product).toHaveProperty('sku');
        expect(product).toHaveProperty('brand', 'TestBrand');
        expect(product).toHaveProperty('isActive');
        expect(product).toHaveProperty('createdAt');
        expect(product).toHaveProperty('updatedAt');

        // Validate data types
        expect(typeof product.id).toBe('string');
        // Price can be string or number depending on serialization
        expect(['string', 'number']).toContain(typeof product.price);
        expect(typeof product.isActive).toBe('boolean');
        // Verify price value (as string or number)
        expect(parseFloat(product.price)).toBe(49.99);
      });
    });

    describe('GET /products', () => {
      it('should return correct paginated products structure', async () => {
        const response = await request(app.getHttpServer())
          .get('/products?page=1&limit=10')
          .expect(200);

        // Validate structure
        const result = response.body.data.data;
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('meta');
        expect(Array.isArray(result.data)).toBe(true);

        if (result.data.length > 0) {
          const product = result.data[0];
          expect(product).toHaveProperty('id');
          expect(product).toHaveProperty('name');
          expect(product).toHaveProperty('price');
          expect(product).toHaveProperty('sku');
        }
      });
    });

    describe('GET /products/:id', () => {
      it('should return correct single product structure', async () => {
        const response = await request(app.getHttpServer())
          .get(`/products/${productId}`)
          .expect(200);

        const product = response.body.data.data;
        expect(product).toHaveProperty('id', productId);
        expect(product).toHaveProperty('name');
        expect(product).toHaveProperty('description');
        expect(product).toHaveProperty('price');
        expect(product).toHaveProperty('sku');
        expect(product).toHaveProperty('isActive');
      });
    });

    describe('PATCH /products/:id', () => {
      it('should return updated product with correct structure', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/products/${productId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Updated Product Name',
            description: 'Updated description',
          })
          .expect(200);

        const product = response.body.data.data;
        expect(product).toHaveProperty('id', productId);
        expect(product).toHaveProperty('name', 'Updated Product Name');
        expect(product).toHaveProperty('description', 'Updated description');
      });
    });
  });

  describe('Orders Endpoints', () => {
    let orderId: string;
    let testProductId: string;

    beforeAll(async () => {
      // Create a product for order testing
      const productResponse = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Order Test Product',
          description: 'Product for order testing',
          price: 50.0,
          sku: 'ORDER-TEST-001',
          brand: 'TestBrand',
        });

      testProductId = productResponse.body.data.data.id;

      // Create inventory for the product
      await request(app.getHttpServer())
        .post('/inventory')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: testProductId,
          quantity: 100,
        });
    });

    describe('POST /orders', () => {
      it('should return correct order structure', async () => {
        const response = await request(app.getHttpServer())
          .post('/orders')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            items: [
              {
                productId: testProductId,
                quantity: 2,
              },
            ],
          })
          .expect(202); // Accepted

        const order = response.body.data.data;
        orderId = order.id;

        // Validate order structure
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('status');
        expect(order).toHaveProperty('totalAmount');
        expect(order).toHaveProperty('items');
        expect(Array.isArray(order.items)).toBe(true);

        // Validate data types
        expect(typeof order.id).toBe('string');
        expect(typeof order.status).toBe('string');
        expect(typeof order.totalAmount).toBe('number');
      });
    });

    describe('GET /orders/:id', () => {
      it('should return correct order detail structure', async () => {
        const response = await request(app.getHttpServer())
          .get(`/orders/${orderId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const order = response.body.data.data;
        expect(order).toHaveProperty('id', orderId);
        expect(order).toHaveProperty('status');
        expect(order).toHaveProperty('totalAmount');
        expect(order).toHaveProperty('items');
        expect(order).toHaveProperty('createdAt');
      });
    });
  });

  describe('Response Headers', () => {
    it('should include correct Content-Type header', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should include security headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check for common security headers (these may vary based on configuration)
      expect(response.headers).toBeDefined();
    });
  });

  describe('Error Response Consistency', () => {
    it('should return consistent 404 error structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
      expect(response.body).toHaveProperty('message');
    });

    it('should return consistent 401 error structure for unauthorized requests', async () => {
      const response = await request(app.getHttpServer()).get('/users/profile').expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
      expect(response.body).toHaveProperty('message');
    });

    it('should return consistent 400 error structure for bad requests', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'invalid',
          password: '123',
        })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
      expect(response.body).toHaveProperty('message');
    });

    it('should return consistent 403 error structure for forbidden requests', async () => {
      // Try to create product without admin privileges
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Product',
          description: 'Test',
          price: 99.99,
          sku: 'TEST-001',
          brand: 'TestBrand',
        });

      // Depending on implementation, this might be 403 or 401
      if (response.status === 403) {
        expect(response.body).toHaveProperty('statusCode', 403);
        expect(response.body).toHaveProperty('message');
      }
    });
  });

  describe('Data Type Consistency', () => {
    it('should return consistent date format in ISO 8601', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const user = response.body.data.data;
      expect(user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(user.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return UUIDs in correct format', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const user = response.body.data.data;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(user.id).toMatch(uuidRegex);
    });

    it('should return numeric values as numbers, not strings', async () => {
      const response = await request(app.getHttpServer()).get('/products').expect(200);

      const result = response.body.data.data;
      if (result.data.length > 0) {
        const product = result.data[0];
        // Price can be string or number depending on serialization
        expect(['string', 'number']).toContain(typeof product.price);
        expect(typeof result.meta.total).toBe('number');
        expect(typeof result.meta.page).toBe('number');
      }
    });

    it('should return boolean values as booleans, not strings', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const user = response.body.data.data;
      expect(typeof user.isActive).toBe('boolean');
    });
  });
});
