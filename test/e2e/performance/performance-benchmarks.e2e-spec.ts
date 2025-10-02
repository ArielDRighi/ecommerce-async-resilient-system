import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../../../src/modules/auth/auth.module';
import { UsersModule } from '../../../src/modules/users/users.module';
import { ProductsModule } from '../../../src/modules/products/products.module';
import { OrdersModule } from '../../../src/modules/orders/orders.module';
import { generateTestEmail, generateTestSKU } from '../../helpers/mock-data';

/* eslint-disable no-console */

/**
 * Performance Benchmarks E2E Tests
 * Category: Performance Tests
 * Purpose: Measure and validate API performance characteristics
 */
describe('Performance Benchmarks (E2E)', () => {
  let app: INestApplication;
  let userToken: string;
  const productIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.test', '.env.example'],
        }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [__dirname + '/../../../src/**/*.entity{.ts,.js}'],
          synchronize: true,
          dropSchema: true,
        }),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
        AuthModule,
        UsersModule,
        ProductsModule,
        OrdersModule,
      ],
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

    // Setup test user
    const userResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: generateTestEmail(),
      password: 'TestPassword123!',
      firstName: 'Perf',
      lastName: 'User',
    });
    userToken = userResponse.body.data.accessToken;

    // Create test products
    for (let i = 0; i < 50; i++) {
      const productResponse = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: `Benchmark Product ${i}`,
          description: `Product ${i} for performance testing`,
          price: 10 + i,
          sku: generateTestSKU(),
        });
      productIds.push(productResponse.body.data.id);
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Response Time Benchmarks', () => {
    it('should respond to GET /health in < 100ms', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer()).get('/health').expect(200);

      const responseTime = Date.now() - startTime;

      console.log(`Health check response time: ${responseTime}ms`);
      expect(responseTime).toBeLessThan(100);
    });

    it('should respond to GET /products/:id in < 200ms', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer()).get(`/products/${productIds[0]}`).expect(200);

      const responseTime = Date.now() - startTime;

      console.log(`Product detail response time: ${responseTime}ms`);
      expect(responseTime).toBeLessThan(200);
    });

    it('should respond to GET /products (paginated) in < 300ms', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer()).get('/products').query({ page: 1, limit: 10 }).expect(200);

      const responseTime = Date.now() - startTime;

      console.log(`Product list response time: ${responseTime}ms`);
      expect(responseTime).toBeLessThan(300);
    });

    it('should respond to POST /auth/login in < 500ms', async () => {
      const email = generateTestEmail();
      const password = 'LoginUser123!';

      await request(app.getHttpServer()).post('/auth/register').send({
        email,
        password,
        firstName: 'Login',
        lastName: 'User',
      });

      const startTime = Date.now();

      await request(app.getHttpServer()).post('/auth/login').send({
        email,
        password,
      });

      const responseTime = Date.now() - startTime;

      console.log(`Login response time: ${responseTime}ms`);
      expect(responseTime).toBeLessThan(500);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 10 concurrent GET requests', async () => {
      const startTime = Date.now();

      const requests = Array.from({ length: 10 }, () =>
        request(app.getHttpServer()).get(`/products/${productIds[0]}`),
      );

      const responses = await Promise.all(requests);

      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / 10;

      console.log(`10 concurrent requests - Total: ${totalTime}ms, Avg: ${avgTime}ms`);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      expect(totalTime).toBeLessThan(2000);
    }, 10000);

    it('should handle 50 concurrent GET requests', async () => {
      const startTime = Date.now();

      const requests = Array.from({ length: 50 }, (_, i) =>
        request(app.getHttpServer()).get(`/products/${productIds[i % productIds.length]}`),
      );

      const responses = await Promise.all(requests);

      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / 50;

      console.log(`50 concurrent requests - Total: ${totalTime}ms, Avg: ${avgTime}ms`);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      expect(totalTime).toBeLessThan(5000);
    }, 15000);

    it('should handle mixed concurrent requests', async () => {
      const startTime = Date.now();

      const requests = [
        ...Array.from({ length: 10 }, () =>
          request(app.getHttpServer()).get(`/products/${productIds[0]}`),
        ),
        ...Array.from({ length: 10 }, () =>
          request(app.getHttpServer()).get('/products').query({ page: 1, limit: 10 }),
        ),
        ...Array.from({ length: 10 }, () => request(app.getHttpServer()).get('/health')),
      ];

      const responses = await Promise.all(requests);

      const totalTime = Date.now() - startTime;

      console.log(`30 mixed concurrent requests - Total: ${totalTime}ms`);

      responses.forEach((response) => {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
      });

      expect(totalTime).toBeLessThan(3000);
    }, 10000);
  });

  describe('Throughput Benchmarks', () => {
    it('should handle 100 sequential requests efficiently', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await request(app.getHttpServer())
          .get(`/products/${productIds[i % productIds.length]}`)
          .expect(200);
      }

      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / 100;

      console.log(`100 sequential requests - Total: ${totalTime}ms, Avg: ${avgTime}ms`);

      expect(avgTime).toBeLessThan(100);
    }, 30000);

    it('should measure requests per second capability', async () => {
      const duration = 5000; // 5 seconds
      const startTime = Date.now();
      let requestCount = 0;

      while (Date.now() - startTime < duration) {
        await request(app.getHttpServer())
          .get(`/products/${productIds[requestCount % productIds.length]}`)
          .expect(200);
        requestCount++;
      }

      const rps = requestCount / (duration / 1000);

      console.log(`Requests per second: ${rps.toFixed(2)}`);

      // Should handle at least 10 requests per second
      expect(rps).toBeGreaterThan(10);
    }, 10000);
  });

  describe('Payload Size Performance', () => {
    it('should handle large paginated responses efficiently', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer()).get('/products').query({ page: 1, limit: 50 }).expect(200);

      const responseTime = Date.now() - startTime;

      console.log(`Large paginated response time: ${responseTime}ms`);
      expect(responseTime).toBeLessThan(500);
    });
  });

  describe('Database Query Performance', () => {
    it('should handle filtered queries efficiently', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/products')
        .query({ minPrice: 10, maxPrice: 30, page: 1, limit: 20 })
        .expect(200);

      const responseTime = Date.now() - startTime;

      console.log(`Filtered query response time: ${responseTime}ms`);
      expect(responseTime).toBeLessThan(400);
    });

    it('should handle sorted queries efficiently', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/products')
        .query({ sortBy: 'price', sortOrder: 'desc', page: 1, limit: 20 })
        .expect(200);

      const responseTime = Date.now() - startTime;

      console.log(`Sorted query response time: ${responseTime}ms`);
      expect(responseTime).toBeLessThan(400);
    });
  });

  describe('Memory Performance', () => {
    it('should not have memory leaks with repeated requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        await request(app.getHttpServer())
          .get(`/products/${productIds[i % productIds.length]}`)
          .expect(200);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`Memory increase after 100 requests: ${memoryIncrease.toFixed(2)} MB`);

      // Memory increase should be reasonable (< 50MB)
      expect(memoryIncrease).toBeLessThan(50);
    }, 30000);
  });

  describe('Error Handling Performance', () => {
    it('should handle 404 errors efficiently', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);

      const responseTime = Date.now() - startTime;

      console.log(`404 error response time: ${responseTime}ms`);
      expect(responseTime).toBeLessThan(100);
    });

    it('should handle validation errors efficiently', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Invalid',
          price: -10,
        })
        .expect(400);

      const responseTime = Date.now() - startTime;

      console.log(`Validation error response time: ${responseTime}ms`);
      expect(responseTime).toBeLessThan(100);
    });
  });
});
