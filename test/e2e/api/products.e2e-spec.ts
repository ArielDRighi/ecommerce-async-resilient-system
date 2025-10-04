import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { TestAppHelper, DatabaseHelper } from '../../helpers';
import { generateTestSKU } from '../../helpers/mock-data';

describe('Products E2E Tests', () => {
  let app: INestApplication;
  let dbHelper: DatabaseHelper;
  let accessToken: string;
  let createdProductId: string;

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

    // Register and login to get auth token
    const userData = {
      email: `test-products-${Date.now()}@test.com`,
      password: 'Test123!',
      firstName: 'Test',
      lastName: 'User',
    };

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userData);

    accessToken = registerResponse.body.data.data.accessToken;
  });

  describe('POST /products', () => {
    it('should create a new product with valid data', async () => {
      const productData = {
        name: 'Test Product',
        description: 'Test product description',
        price: 99.99,
        sku: generateTestSKU(),
        brand: 'TestBrand',
        weight: 1.5,
        costPrice: 50.0,
        compareAtPrice: 119.99,
        trackInventory: true,
        minimumStock: 10,
        tags: ['test', 'product'],
        images: ['https://example.com/image1.jpg'],
        attributes: { color: 'red', size: 'medium' },
      };

      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productData)
        .expect(HttpStatus.CREATED);

      const { data } = response.body;
      const productResponse = data.data;

      expect(productResponse).toHaveProperty('id');
      expect(productResponse.name).toBe(productData.name);
      expect(productResponse.description).toBe(productData.description);
      expect(parseFloat(productResponse.price)).toBe(productData.price);
      expect(productResponse.sku).toBe(productData.sku);
      expect(productResponse.brand).toBe(productData.brand);
      expect(productResponse.isActive).toBe(true);

      // Save product ID for other tests
      createdProductId = productResponse.id;
    });

    it('should create a product with minimal required fields', async () => {
      const productData = {
        name: 'Minimal Product',
        price: 49.99,
        sku: generateTestSKU(),
      };

      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productData)
        .expect(HttpStatus.CREATED);

      const { data } = response.body;
      const productResponse = data.data;

      expect(productResponse).toHaveProperty('id');
      expect(productResponse.name).toBe(productData.name);
      expect(parseFloat(productResponse.price)).toBe(productData.price);
      expect(productResponse.sku).toBe(productData.sku);
    });

    it('should fail to create product without authentication', async () => {
      const productData = {
        name: 'Test Product',
        price: 99.99,
        sku: generateTestSKU(),
      };

      await request(app.getHttpServer())
        .post('/products')
        .send(productData)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail to create product with duplicate SKU', async () => {
      const sku = generateTestSKU();
      const productData = {
        name: 'Test Product',
        price: 99.99,
        sku,
      };

      // Create first product
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productData)
        .expect(HttpStatus.CREATED);

      // Try to create second product with same SKU
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productData)
        .expect(HttpStatus.CONFLICT);
    });

    it('should fail to create product with invalid price', async () => {
      const productData = {
        name: 'Test Product',
        price: -10, // Invalid negative price
        sku: generateTestSKU(),
      };

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create product with missing required fields', async () => {
      const productData = {
        name: 'Test Product',
        // Missing price and sku
      };

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create product with invalid SKU format', async () => {
      const productData = {
        name: 'Test Product',
        price: 99.99,
        sku: 'invalid sku with spaces', // Invalid SKU format
      };

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productData)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /products', () => {
    beforeEach(async () => {
      // Create multiple test products
      for (let i = 1; i <= 5; i++) {
        await request(app.getHttpServer())
          .post('/products')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: `Test Product ${i}`,
            description: `Description for product ${i}`,
            price: 50 + i * 10,
            sku: generateTestSKU(),
            brand: i % 2 === 0 ? 'BrandA' : 'BrandB',
            tags: ['test', i % 2 === 0 ? 'even' : 'odd'],
          });
      }
    });

    it('should list all products with default pagination', async () => {
      const response = await request(app.getHttpServer()).get('/products').expect(HttpStatus.OK);

      const { data } = response.body;
      const productsResponse = data.data;

      expect(productsResponse).toHaveProperty('data');
      expect(productsResponse).toHaveProperty('meta');
      expect(Array.isArray(productsResponse.data)).toBe(true);
      expect(productsResponse.data.length).toBeGreaterThan(0);
      expect(productsResponse.meta).toHaveProperty('page');
      expect(productsResponse.meta).toHaveProperty('totalPages');
      expect(productsResponse.meta).toHaveProperty('total');
    });

    it('should list products with custom pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/products?page=1&limit=2')
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const productsResponse = data.data;

      expect(productsResponse.data.length).toBeLessThanOrEqual(2);
      expect(productsResponse.meta.page).toBe(1);
      expect(productsResponse.meta.limit).toBe(2);
    });

    it('should filter products by brand', async () => {
      const response = await request(app.getHttpServer())
        .get('/products?brand=BrandA')
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const productsResponse = data.data;

      expect(productsResponse.data.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      productsResponse.data.forEach((product: any) => {
        expect(product.brand).toBe('BrandA');
      });
    });

    it('should filter products by price range', async () => {
      const response = await request(app.getHttpServer())
        .get('/products?minPrice=60&maxPrice=80')
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const productsResponse = data.data;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      productsResponse.data.forEach((product: any) => {
        const price = parseFloat(product.price);
        expect(price).toBeGreaterThanOrEqual(60);
        expect(price).toBeLessThanOrEqual(80);
      });
    });

    it('should sort products by price ascending', async () => {
      const response = await request(app.getHttpServer())
        .get('/products?sortBy=price&sortOrder=ASC')
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const productsResponse = data.data;

      for (let i = 1; i < productsResponse.data.length; i++) {
        const currentPrice = parseFloat(productsResponse.data[i].price);
        const previousPrice = parseFloat(productsResponse.data[i - 1].price);
        expect(currentPrice).toBeGreaterThanOrEqual(previousPrice);
      }
    });

    it('should sort products by price descending', async () => {
      const response = await request(app.getHttpServer())
        .get('/products?sortBy=price&sortOrder=DESC')
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const productsResponse = data.data;

      for (let i = 1; i < productsResponse.data.length; i++) {
        const currentPrice = parseFloat(productsResponse.data[i].price);
        const previousPrice = parseFloat(productsResponse.data[i - 1].price);
        expect(currentPrice).toBeLessThanOrEqual(previousPrice);
      }
    });
  });

  describe('GET /products/search', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Wireless Headphones',
          description: 'Premium wireless headphones with noise cancellation',
          price: 299.99,
          sku: generateTestSKU(),
          tags: ['wireless', 'audio', 'premium'],
        });

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Bluetooth Speaker',
          description: 'Portable bluetooth speaker',
          price: 79.99,
          sku: generateTestSKU(),
          tags: ['bluetooth', 'audio'],
        });
    });

    it('should search products by name', async () => {
      const response = await request(app.getHttpServer())
        .get('/products/search?q=Headphones')
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const searchResults = data.data;

      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].name).toContain('Headphones');
    });

    it('should search products by description', async () => {
      const response = await request(app.getHttpServer())
        .get('/products/search?q=portable')
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const searchResults = data.data;

      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBeGreaterThan(0);
    });

    it('should limit search results', async () => {
      const response = await request(app.getHttpServer())
        .get('/products/search?q=audio&limit=1')
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const searchResults = data.data;

      expect(searchResults.length).toBeLessThanOrEqual(1);
    });

    it('should return empty array for non-matching search', async () => {
      const response = await request(app.getHttpServer())
        .get('/products/search?q=nonexistent')
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const searchResults = data.data;

      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBe(0);
    });
  });

  describe('GET /products/:id', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test Product',
          price: 99.99,
          sku: generateTestSKU(),
        });

      createdProductId = response.body.data.data.id;
    });

    it('should get product by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${createdProductId}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const product = data.data;

      expect(product.id).toBe(createdProductId);
      expect(product).toHaveProperty('name');
      expect(product).toHaveProperty('price');
      expect(product).toHaveProperty('sku');
    });

    it('should return 404 for non-existent product', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .get(`/products/${nonExistentId}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .get('/products/invalid-uuid')
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('PATCH /products/:id', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Original Product',
          description: 'Original description',
          price: 99.99,
          sku: generateTestSKU(),
          brand: 'OriginalBrand',
        });

      createdProductId = response.body.data.data.id;
    });

    it('should update product with valid data', async () => {
      const updateData = {
        name: 'Updated Product',
        description: 'Updated description',
        price: 149.99,
      };

      const response = await request(app.getHttpServer())
        .patch(`/products/${createdProductId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const updatedProduct = data.data;

      expect(updatedProduct.name).toBe(updateData.name);
      expect(updatedProduct.description).toBe(updateData.description);
      expect(parseFloat(updatedProduct.price)).toBe(updateData.price);
    });

    it('should partially update product', async () => {
      const updateData = {
        price: 129.99,
      };

      const response = await request(app.getHttpServer())
        .patch(`/products/${createdProductId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const updatedProduct = data.data;

      expect(parseFloat(updatedProduct.price)).toBe(updateData.price);
      expect(updatedProduct.name).toBe('Original Product'); // Should remain unchanged
    });

    it('should fail to update product without authentication', async () => {
      const updateData = {
        name: 'Updated Product',
      };

      await request(app.getHttpServer())
        .patch(`/products/${createdProductId}`)
        .send(updateData)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 for non-existent product', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .patch(`/products/${nonExistentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail to update with invalid price', async () => {
      await request(app.getHttpServer())
        .patch(`/products/${createdProductId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ price: -50 })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('PATCH /products/:id/activate', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test Product',
          price: 99.99,
          sku: generateTestSKU(),
          isActive: false,
        });

      createdProductId = response.body.data.data.id;
    });

    it('should activate an inactive product', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/products/${createdProductId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const product = data.data;

      expect(product.isActive).toBe(true);
    });

    it('should fail to activate without authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/products/${createdProductId}/activate`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('PATCH /products/:id/deactivate', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test Product',
          price: 99.99,
          sku: generateTestSKU(),
        });

      createdProductId = response.body.data.data.id;
    });

    it('should deactivate an active product', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/products/${createdProductId}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const product = data.data;

      expect(product.isActive).toBe(false);
    });

    it('should fail to deactivate without authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/products/${createdProductId}/deactivate`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('DELETE /products/:id', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Product to Delete',
          price: 99.99,
          sku: generateTestSKU(),
        });

      createdProductId = response.body.data.data.id;
    });

    it('should soft delete product', async () => {
      await request(app.getHttpServer())
        .delete(`/products/${createdProductId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify product is soft deleted (not returned in normal queries)
      await request(app.getHttpServer())
        .get(`/products/${createdProductId}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail to delete product without authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/products/${createdProductId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 for non-existent product', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .delete(`/products/${nonExistentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
