import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import request from 'supertest';
import { generateTestEmail, generateTestSKU } from '../../helpers/mock-data';
import { sleep } from '../../helpers/test-helpers';

/* eslint-disable no-console */

/**
 * Complete E-commerce User Journey E2E Tests
 * Category: Business Flows
 * Purpose: Test complete user flows from registration to order completion
 */
describe('Complete E-commerce User Journey (Business Flow)', () => {
  let app: INestApplication;
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('Complete Journey: User Registration → Browse Products → Create Order → Track Status', async () => {
    // ========================================================================
    // STEP 1: User Registration
    // ========================================================================
    const userEmail = generateTestEmail();
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: userEmail,
        password: 'CustomerPassword123!',
        firstName: 'John',
        lastName: 'Customer',
      })
      .expect(201);

    expect(registerResponse.body).toHaveProperty('success', true);
    expect(registerResponse.body.data).toHaveProperty('accessToken');
    userToken = registerResponse.body.data.accessToken;
    userId = registerResponse.body.data.user.id;

    console.log('✅ Step 1: User registered successfully');

    // ========================================================================
    // STEP 2: Browse Product Catalog
    // ========================================================================
    // First, create a product (simulating admin action)
    const adminResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: generateTestEmail(),
      password: 'AdminPassword123!',
      firstName: 'Admin',
      lastName: 'User',
    });
    const adminToken = adminResponse.body.data.accessToken;

    const productResponse = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Premium Laptop',
        description: 'High-performance laptop for professionals',
        price: 1299.99,
        sku: generateTestSKU(),
        brand: 'TechBrand',
        weight: 2.5,
        trackInventory: false,
      })
      .expect(201);

    productId = productResponse.body.data.id;

    // Browse products as customer
    const browseResponse = await request(app.getHttpServer())
      .get('/products')
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(browseResponse.body.data.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: productId })]),
    );

    console.log('✅ Step 2: Products browsed successfully');

    // ========================================================================
    // STEP 3: View Product Details
    // ========================================================================
    const productDetailResponse = await request(app.getHttpServer())
      .get(`/products/${productId}`)
      .expect(200);

    expect(productDetailResponse.body.data.id).toBe(productId);
    expect(productDetailResponse.body.data.name).toBe('Premium Laptop');
    expect(productDetailResponse.body.data.price).toBe(1299.99);

    console.log('✅ Step 3: Product details viewed successfully');

    // ========================================================================
    // STEP 4: Create Order
    // ========================================================================
    const createOrderResponse = await request(app.getHttpServer())
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
      .expect(202); // Async processing, returns 202 Accepted

    expect(createOrderResponse.body).toHaveProperty('success', true);
    expect(createOrderResponse.body.data).toHaveProperty('id');
    expect(createOrderResponse.body.data).toHaveProperty('status');
    orderId = createOrderResponse.body.data.id;

    console.log('✅ Step 4: Order created successfully (async processing started)');

    // ========================================================================
    // STEP 5: Check Order Status
    // ========================================================================
    const orderStatusResponse = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(orderStatusResponse.body.data.id).toBe(orderId);
    expect(orderStatusResponse.body.data.userId).toBe(userId);
    expect(['PENDING', 'PROCESSING', 'CONFIRMED']).toContain(orderStatusResponse.body.data.status);

    console.log(`✅ Step 5: Order status checked - ${orderStatusResponse.body.data.status}`);

    // ========================================================================
    // STEP 6: View User's Order History
    // ========================================================================
    const orderHistoryResponse = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(orderHistoryResponse.body.data.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: orderId })]),
    );

    console.log('✅ Step 6: Order history retrieved successfully');

    // ========================================================================
    // STEP 7: Wait and check for order processing (async)
    // ========================================================================
    await sleep(2000); // Wait for async processing

    const finalOrderStatusResponse = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    // Order should have progressed in processing
    expect(['PENDING', 'PROCESSING', 'CONFIRMED', 'PAYMENT_PENDING']).toContain(
      finalOrderStatusResponse.body.data.status,
    );

    console.log(`✅ Step 7: Final order status - ${finalOrderStatusResponse.body.data.status}`);

    // ========================================================================
    // JOURNEY COMPLETE
    // ========================================================================
    console.log('\n🎉 Complete E-commerce Journey Test PASSED!');
    console.log(`   - User ID: ${userId}`);
    console.log(`   - Product ID: ${productId}`);
    console.log(`   - Order ID: ${orderId}`);
    console.log(`   - Final Status: ${finalOrderStatusResponse.body.data.status}`);
  });

  it('Should handle order creation with multiple products', async () => {
    // Create multiple products
    const adminResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: generateTestEmail(),
      password: 'AdminPassword123!',
      firstName: 'Admin',
      lastName: 'User',
    });
    const adminToken = adminResponse.body.data.accessToken;

    const product1 = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Product 1',
        description: 'Test product 1',
        price: 50.0,
        sku: generateTestSKU(),
      });

    const product2 = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Product 2',
        description: 'Test product 2',
        price: 75.0,
        sku: generateTestSKU(),
      });

    // Register user
    const userResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: generateTestEmail(),
      password: 'UserPassword123!',
      firstName: 'Test',
      lastName: 'User',
    });
    const userToken = userResponse.body.data.accessToken;

    // Create order with multiple items
    const orderResponse = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        items: [
          {
            productId: product1.body.data.id,
            quantity: 2,
          },
          {
            productId: product2.body.data.id,
            quantity: 1,
          },
        ],
      })
      .expect(202);

    expect(orderResponse.body).toHaveProperty('success', true);
    expect(orderResponse.body.data.totalAmount).toBe(175.0); // (50*2) + (75*1)

    console.log('✅ Multi-product order created successfully');
  });

  it('Should prevent order creation without authentication', async () => {
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

    console.log('✅ Unauthorized order creation prevented');
  });
});
