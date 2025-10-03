import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { generateTestEmail, generateTestSKU } from '../../helpers/mock-data';

/**
 * Products API E2E Tests
 * Category: API Tests
 * Purpose: Test product endpoints functionality
 */
describe('Products API (E2E)', () => {
  let app: INestApplication;
  let adminToken: string;
  let createdProductId: string;

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

  describe('POST /products', () => {
    it('should create a new product', async () => {
      const productDto = {
        name: 'Test Product',
        description: 'A great test product',
        price: 99.99,
        sku: generateTestSKU(),
        brand: 'TestBrand',
        weight: 1.5,
        trackInventory: true,
        minimumStock: 5,
      };

      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(productDto)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(productDto.name);
      expect(response.body.data.price).toBe(productDto.price);
      expect(response.body.data.sku).toBe(productDto.sku);

      createdProductId = response.body.data.id;
    });

    it('should fail with duplicate SKU', async () => {
      const duplicateSKU = generateTestSKU();

      // Create first product
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product 1',
          description: 'Product 1',
          price: 99.99,
          sku: duplicateSKU,
        });

      // Try to create with same SKU
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product 2',
          description: 'Product 2',
          price: 89.99,
          sku: duplicateSKU,
        })
        .expect(409);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail with negative price', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Product',
          description: 'Invalid price',
          price: -10.0,
          sku: generateTestSKU(),
        })
        .expect(400);
    });

    it('should fail with missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Incomplete Product',
          // Missing price and sku
        })
        .expect(400);
    });
  });

  describe('GET /products', () => {
    it('should get all products with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/products')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('meta');
      expect(Array.isArray(response.body.data.data)).toBe(true);
      expect(response.body.data.meta).toHaveProperty('page', 1);
      expect(response.body.data.meta).toHaveProperty('limit', 10);
    });

    it('should filter products by price range', async () => {
      const response = await request(app.getHttpServer())
        .get('/products')
        .query({ minPrice: 50, maxPrice: 150 })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      const products = response.body.data.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products.forEach((product: any) => {
        expect(product.price).toBeGreaterThanOrEqual(50);
        expect(product.price).toBeLessThanOrEqual(150);
      });
    });

    it('should sort products by price ascending', async () => {
      const response = await request(app.getHttpServer())
        .get('/products')
        .query({ sortBy: 'price', sortOrder: 'asc' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      const products = response.body.data.data;
      for (let i = 1; i < products.length; i++) {
        expect(products[i].price).toBeGreaterThanOrEqual(products[i - 1].price);
      }
    });
  });

  describe('GET /products/:id', () => {
    it('should get a product by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${createdProductId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.id).toBe(createdProductId);
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('price');
    });

    it('should return 404 for non-existent product', async () => {
      await request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('GET /products/search', () => {
    it('should search products by query', async () => {
      const response = await request(app.getHttpServer())
        .get('/products/search')
        .query({ q: 'Test' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('PUT /products/:id', () => {
    it('should update a product', async () => {
      const updateDto = {
        name: 'Updated Product Name',
        price: 149.99,
      };

      const response = await request(app.getHttpServer())
        .put(`/products/${createdProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.name).toBe(updateDto.name);
      expect(response.body.data.price).toBe(updateDto.price);
    });

    it('should fail to update non-existent product', async () => {
      await request(app.getHttpServer())
        .put('/products/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  describe('PATCH /products/:id/activate', () => {
    it('should activate a product', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/products/${createdProductId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.isActive).toBe(true);
    });
  });

  describe('PATCH /products/:id/deactivate', () => {
    it('should deactivate a product', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/products/${createdProductId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.isActive).toBe(false);
    });
  });

  describe('DELETE /products/:id', () => {
    it('should soft delete a product', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/products/${createdProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should not find deleted product', async () => {
      await request(app.getHttpServer()).get(`/products/${createdProductId}`).expect(404);
    });
  });
});
