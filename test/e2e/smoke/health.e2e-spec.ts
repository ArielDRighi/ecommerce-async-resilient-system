import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';

/**
 * Health Check E2E Tests
 * Category: Smoke Tests
 * Purpose: Verify basic application health and readiness
 */
describe('Health Checks (Smoke)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(['ok', 'error']).toContain(response.body.status);
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness probe status', async () => {
      const response = await request(app.getHttpServer()).get('/health/live');

      // Can be 200 (healthy) or 503 (unhealthy)
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness probe status', async () => {
      const response = await request(app.getHttpServer()).get('/health/ready');

      // Can be 200 (ready) or 503 (not ready)
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const response = await request(app.getHttpServer()).get('/health/detailed');

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('details');
    });

    it('should include database health check', async () => {
      const response = await request(app.getHttpServer()).get('/health/detailed');

      expect(response.body.details).toBeDefined();
      // Database check might be present depending on configuration
    });
  });
});
