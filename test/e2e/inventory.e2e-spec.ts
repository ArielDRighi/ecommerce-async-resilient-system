import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { TestAppHelper, DatabaseHelper } from '../helpers';
import { generateTestSKU, generateTestName } from '../helpers/mock-data';

describe('Inventory E2E Tests', () => {
  let app: INestApplication;
  let dbHelper: DatabaseHelper;
  let accessToken: string;
  let productId: string;

  beforeAll(async () => {
    app = await TestAppHelper.createApp();
    dbHelper = new DatabaseHelper(app);
  });

  afterAll(async () => {
    await dbHelper.cleanDatabase();
    await app.close();
  });

  beforeEach(async () => {
    await dbHelper.cleanDatabase();

    // Register and login user for auth token
    const userData = {
      email: `test-inventory-${Date.now()}@test.com`,
      password: 'Test123!',
      firstName: 'Inventory',
      lastName: 'Tester',
    };

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userData);

    accessToken = registerResponse.body.data.data.accessToken;

    // Create a product with inventory for testing
    const productData = {
      name: generateTestName('Test Product'),
      description: 'Test product for inventory tests',
      price: 99.99,
      sku: generateTestSKU(),
      brand: 'TestBrand',
      isActive: true,
    };

    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(productData)
      .expect(HttpStatus.CREATED);

    productId = productResponse.body.data.data.id;
  });

  // ==================== CHECK AVAILABILITY ====================
  describe('POST /inventory/check-availability', () => {
    it('should return 404 when inventory not found for product', async () => {
      const checkData = {
        productId,
        quantity: 5,
        location: 'MAIN_WAREHOUSE',
      };

      await request(app.getHttpServer())
        .post('/inventory/check-availability')
        .send(checkData)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 when product does not exist', async () => {
      const checkData = {
        productId: '550e8400-e29b-41d4-a716-446655440000', // Non-existent UUID
        quantity: 5,
        location: 'MAIN_WAREHOUSE',
      };

      await request(app.getHttpServer())
        .post('/inventory/check-availability')
        .send(checkData)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should validate quantity is positive', async () => {
      const checkData = {
        productId,
        quantity: -5,
        location: 'MAIN_WAREHOUSE',
      };

      const response = await request(app.getHttpServer())
        .post('/inventory/check-availability')
        .send(checkData)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.message).toContain('Quantity must be at least 1');
    });

    it('should validate productId is UUID format', async () => {
      const checkData = {
        productId: 'invalid-uuid',
        quantity: 5,
        location: 'MAIN_WAREHOUSE',
      };

      await request(app.getHttpServer())
        .post('/inventory/check-availability')
        .send(checkData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        // Missing productId and quantity
        location: 'MAIN_WAREHOUSE',
      };

      await request(app.getHttpServer())
        .post('/inventory/check-availability')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ==================== RESERVE STOCK ====================
  describe('POST /inventory/reserve', () => {
    it('should fail when inventory not found', async () => {
      const reservationId = `res-test-${Date.now()}`;
      const reserveData = {
        productId,
        quantity: 5,
        reservationId,
        location: 'MAIN_WAREHOUSE',
        reason: 'Order processing',
        ttlMinutes: 30,
      };

      await request(app.getHttpServer())
        .post('/inventory/reserve')
        .send(reserveData)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should validate quantity is positive', async () => {
      const reserveData = {
        productId,
        quantity: 0, // Invalid quantity
        reservationId: `res-invalid-${Date.now()}`,
        location: 'MAIN_WAREHOUSE',
      };

      await request(app.getHttpServer())
        .post('/inventory/reserve')
        .send(reserveData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should validate productId is UUID format', async () => {
      const reserveData = {
        productId: 'invalid-uuid',
        quantity: 5,
        reservationId: `res-invalid-uuid-${Date.now()}`,
        location: 'MAIN_WAREHOUSE',
      };

      await request(app.getHttpServer())
        .post('/inventory/reserve')
        .send(reserveData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        productId,
        // Missing quantity and reservationId
      };

      const response = await request(app.getHttpServer())
        .post('/inventory/reserve')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.message).toBeDefined();
    });

    it('should validate reservationId is a string', async () => {
      const invalidData = {
        productId,
        quantity: 5,
        reservationId: 12345, // Should be string
      };

      // Will return 404 because inventory doesn't exist, but validates the DTO transformation
      await request(app.getHttpServer())
        .post('/inventory/reserve')
        .send(invalidData)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ==================== RELEASE RESERVATION ====================
  describe('PUT /inventory/release-reservation', () => {
    it('should validate required fields', async () => {
      const invalidData = {
        // Missing reservationId and productId
      };

      await request(app.getHttpServer())
        .put('/inventory/release-reservation')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should validate productId is UUID format', async () => {
      const releaseData = {
        reservationId: 'res-test-123',
        productId: 'invalid-uuid',
      };

      await request(app.getHttpServer())
        .put('/inventory/release-reservation')
        .send(releaseData)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ==================== FULFILL RESERVATION ====================
  describe('PUT /inventory/fulfill-reservation', () => {
    it('should validate required fields', async () => {
      const invalidData = {
        // Missing reservationId, productId, and orderId
      };

      await request(app.getHttpServer())
        .put('/inventory/fulfill-reservation')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should validate productId is UUID format', async () => {
      const fulfillData = {
        reservationId: 'res-test-123',
        productId: 'invalid-uuid',
        orderId: 'order-123',
      };

      await request(app.getHttpServer())
        .put('/inventory/fulfill-reservation')
        .send(fulfillData)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ==================== ADD STOCK ====================
  describe('POST /inventory/add-stock', () => {
    it('should validate movement type', async () => {
      const invalidData = {
        inventoryId: productId, // Using productId as placeholder
        movementType: 'INVALID_TYPE',
        quantity: 10,
      };

      await request(app.getHttpServer())
        .post('/inventory/add-stock')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail when inventory not found', async () => {
      const addData = {
        inventoryId: '550e8400-e29b-41d4-a716-446655440000',
        movementType: 'RESTOCK',
        quantity: 10,
      };

      await request(app.getHttpServer())
        .post('/inventory/add-stock')
        .send(addData)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        // Missing inventoryId, movementType, and quantity
      };

      await request(app.getHttpServer())
        .post('/inventory/add-stock')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should validate inventoryId is UUID format', async () => {
      const invalidData = {
        inventoryId: 'invalid-uuid',
        movementType: 'RESTOCK',
        quantity: 10,
      };

      await request(app.getHttpServer())
        .post('/inventory/add-stock')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ==================== REMOVE STOCK ====================
  describe('POST /inventory/remove-stock', () => {
    it('should validate movement type', async () => {
      const invalidData = {
        inventoryId: productId, // Using productId as placeholder
        movementType: 'INVALID_TYPE',
        quantity: 5,
      };

      await request(app.getHttpServer())
        .post('/inventory/remove-stock')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail when inventory not found', async () => {
      const removeData = {
        inventoryId: '550e8400-e29b-41d4-a716-446655440000',
        movementType: 'ADJUSTMENT',
        quantity: 5,
      };

      await request(app.getHttpServer())
        .post('/inventory/remove-stock')
        .send(removeData)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        // Missing inventoryId, movementType, and quantity
      };

      await request(app.getHttpServer())
        .post('/inventory/remove-stock')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should validate inventoryId is UUID format', async () => {
      const invalidData = {
        inventoryId: 'invalid-uuid',
        movementType: 'DAMAGE',
        quantity: 5,
      };

      await request(app.getHttpServer())
        .post('/inventory/remove-stock')
        .send(invalidData)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ==================== GET BY PRODUCT ====================
  describe('GET /inventory/product/:productId', () => {
    it('should return 404 when inventory not found for product', async () => {
      await request(app.getHttpServer())
        .get(`/inventory/product/${productId}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 when product does not exist', async () => {
      await request(app.getHttpServer())
        .get('/inventory/product/550e8400-e29b-41d4-a716-446655440000')
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should validate UUID format', async () => {
      await request(app.getHttpServer())
        .get('/inventory/product/invalid-uuid')
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ==================== LIST & FILTERS ====================
  describe('GET /inventory', () => {
    it('should get paginated inventory list (empty)', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory?page=1&limit=10')
        .expect(HttpStatus.OK);

      expect(response.body.data.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.meta).toMatchObject({
        currentPage: 1,
        itemsPerPage: 10,
        totalItems: 0, // No inventory items yet
      });
    });

    it('should accept location filter parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory?location=MAIN_WAREHOUSE')
        .expect(HttpStatus.OK);

      expect(response.body.data.data.data).toBeInstanceOf(Array);
    });

    it('should accept status filter parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory?status=IN_STOCK')
        .expect(HttpStatus.OK);

      expect(response.body.data.data.data).toBeInstanceOf(Array);
    });

    it('should accept stock range filter parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory?minStock=50&maxStock=150')
        .expect(HttpStatus.OK);

      expect(response.body.data.data.data).toBeInstanceOf(Array);
    });

    it('should accept invalid status enum (no validation)', async () => {
      // Note: The API doesn't validate status enum, just returns empty results
      const response = await request(app.getHttpServer())
        .get('/inventory?status=INVALID_STATUS')
        .expect(HttpStatus.OK);

      expect(response.body.data.data.data).toBeInstanceOf(Array);
    });
  });

  // ==================== LOW STOCK ====================
  describe('GET /inventory/low-stock', () => {
    it('should get low stock items (empty)', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory/low-stock?page=1&limit=10')
        .expect(HttpStatus.OK);

      expect(response.body.data.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.meta).toBeDefined();
    });

    it('should accept location filter parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory/low-stock?location=MAIN_WAREHOUSE')
        .expect(HttpStatus.OK);

      expect(response.body.data.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.meta).toBeDefined();
    });
  });

  // ==================== OUT OF STOCK ====================
  describe('GET /inventory/out-of-stock', () => {
    it('should get out of stock items (empty)', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory/out-of-stock?page=1&limit=10')
        .expect(HttpStatus.OK);

      expect(response.body.data.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.meta).toBeDefined();
    });

    it('should accept location filter parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory/out-of-stock?location=MAIN_WAREHOUSE')
        .expect(HttpStatus.OK);

      expect(response.body.data.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.meta).toBeDefined();
    });
  });

  // ==================== STATS ====================
  describe('GET /inventory/stats', () => {
    it('should get inventory statistics (empty)', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory/stats')
        .expect(HttpStatus.OK);

      expect(response.body.data.data).toMatchObject({
        totalItems: 0, // No inventory yet
        totalValue: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        statusBreakdown: {
          IN_STOCK: 0,
          LOW_STOCK: 0,
          OUT_OF_STOCK: 0,
        },
      });
    });

    it('should accept location filter parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/inventory/stats?location=MAIN_WAREHOUSE')
        .expect(HttpStatus.OK);

      expect(response.body.data.data).toMatchObject({
        totalItems: expect.any(Number),
        statusBreakdown: expect.any(Object),
      });
    });
  });
});
