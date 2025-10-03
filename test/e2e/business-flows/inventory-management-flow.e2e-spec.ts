import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import request from 'supertest';
import { generateTestEmail, generateTestSKU } from '../../helpers/mock-data';

/**
 * Inventory Management Flow E2E Tests
 * Category: Business Flows
 * Purpose: Test inventory tracking and stock management workflows
 */
describe('Inventory Management Flow (Business Flow)', () => {
  let app: INestApplication;
  let adminToken: string;
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

    // Register admin user
    const adminResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: generateTestEmail(),
      password: 'AdminPassword123!',
      firstName: 'Admin',
      lastName: 'User',
    });
    adminToken = adminResponse.body.data.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('Complete Inventory Flow: Create Product → Add Stock → Track Changes → Check Low Stock', async () => {
    // ========================================================================
    // STEP 1: Create product with inventory tracking
    // ========================================================================
    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tracked Widget',
        description: 'Widget with inventory tracking',
        price: 49.99,
        sku: generateTestSKU(),
        trackInventory: true,
        minimumStock: 10,
      })
      .expect(201);

    productId = productResponse.body.data.id;
    expect(productResponse.body.data.trackInventory).toBe(true);

    // ========================================================================
    // STEP 2: Add initial stock
    // ========================================================================
    const addStockResponse = await request(app.getHttpServer())
      .post('/inventory/add-stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: productId,
        quantity: 100,
        reason: 'Initial stock',
      })
      .expect(201);

    expect(addStockResponse.body.data.quantity).toBeGreaterThanOrEqual(100);

    // ========================================================================
    // STEP 3: Check inventory status
    // ========================================================================
    const inventoryStatusResponse = await request(app.getHttpServer())
      .get(`/inventory/product/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(inventoryStatusResponse.body.data.availableQuantity).toBeGreaterThanOrEqual(100);

    // ========================================================================
    // STEP 4: Reserve stock (simulate order)
    // ========================================================================
    const reserveResponse = await request(app.getHttpServer())
      .post('/inventory/reserve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: productId,
        quantity: 50,
        orderId: 'test-order-123',
      })
      .expect(200);

    expect(reserveResponse.body.data.reservedQuantity).toBe(50);

    // ========================================================================
    // STEP 5: Check updated inventory
    // ========================================================================
    const updatedInventoryResponse = await request(app.getHttpServer())
      .get(`/inventory/product/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(updatedInventoryResponse.body.data.availableQuantity).toBe(50);
    expect(updatedInventoryResponse.body.data.reservedQuantity).toBe(50);

    // ========================================================================
    // STEP 6: Get inventory history
    // ========================================================================
    const historyResponse = await request(app.getHttpServer())
      .get(`/inventory/product/${productId}/history`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(historyResponse.body.data)).toBe(true);
    expect(historyResponse.body.data.length).toBeGreaterThan(0);

    // ========================================================================
    // STEP 7: Check low stock alert
    // ========================================================================
    const lowStockResponse = await request(app.getHttpServer())
      .get('/inventory/low-stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(lowStockResponse.body.data)).toBe(true);
  });

  it('Should prevent negative stock', async () => {
    // Create product
    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Limited Stock Product',
        description: 'Product with limited stock',
        price: 29.99,
        sku: generateTestSKU(),
        trackInventory: true,
      })
      .expect(201);

    const limitedProductId = productResponse.body.data.id;

    // Add small stock
    await request(app.getHttpServer())
      .post('/inventory/add-stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: limitedProductId,
        quantity: 5,
        reason: 'Limited stock',
      })
      .expect(201);

    // Try to reserve more than available
    await request(app.getHttpServer())
      .post('/inventory/reserve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: limitedProductId,
        quantity: 10,
        orderId: 'test-order-overflow',
      })
      .expect(400);
  });

  it('Should handle stock adjustments', async () => {
    // Create product with stock
    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Adjustable Stock Product',
        description: 'Product for stock adjustment',
        price: 39.99,
        sku: generateTestSKU(),
        trackInventory: true,
      })
      .expect(201);

    const adjustableProductId = productResponse.body.data.id;

    await request(app.getHttpServer())
      .post('/inventory/add-stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: adjustableProductId,
        quantity: 100,
        reason: 'Initial stock',
      })
      .expect(201);

    // Adjust stock down (damage, loss, etc.)
    const adjustResponse = await request(app.getHttpServer())
      .post('/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: adjustableProductId,
        adjustment: -15,
        reason: 'Damaged items removed',
      })
      .expect(200);

    expect(adjustResponse.body.data.adjustment).toBe(-15);

    // Verify adjusted quantity
    const inventoryResponse = await request(app.getHttpServer())
      .get(`/inventory/product/${adjustableProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(inventoryResponse.body.data.availableQuantity).toBe(85);
  });

  it('Should release reserved stock', async () => {
    // Create product with stock
    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Reservable Product',
        description: 'Product for reservation testing',
        price: 59.99,
        sku: generateTestSKU(),
        trackInventory: true,
      })
      .expect(201);

    const reservableProductId = productResponse.body.data.id;

    await request(app.getHttpServer())
      .post('/inventory/add-stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: reservableProductId,
        quantity: 100,
        reason: 'Initial stock',
      })
      .expect(201);

    // Reserve stock
    await request(app.getHttpServer())
      .post('/inventory/reserve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: reservableProductId,
        quantity: 30,
        orderId: 'test-order-release',
      })
      .expect(200);

    // Release reservation (order cancelled)
    const releaseResponse = await request(app.getHttpServer())
      .post('/inventory/release')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: reservableProductId,
        quantity: 30,
        orderId: 'test-order-release',
      })
      .expect(200);

    expect(releaseResponse.body).toHaveProperty('success', true);

    // Verify stock released
    const inventoryResponse = await request(app.getHttpServer())
      .get(`/inventory/product/${reservableProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(inventoryResponse.body.data.availableQuantity).toBe(100);
    expect(inventoryResponse.body.data.reservedQuantity).toBe(0);
  });
});
