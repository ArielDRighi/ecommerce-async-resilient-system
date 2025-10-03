import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestAppHelper } from '../helpers';

/**
 * Health Check E2E Tests
 * Verifica los endpoints de salud de la aplicación
 */
describe('Health Check (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await TestAppHelper.createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('details');
      expect(response.body.status).toBe('ok');

      // Verificar que la base de datos está UP
      expect(response.body.details).toHaveProperty('database');
      expect(response.body.details.database.status).toBe('up');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');

      // El readiness check solo verifica la base de datos
      expect(response.body.details).toHaveProperty('database');
      expect(response.body.details.database.status).toBe('up');
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', async () => {
      const response = await request(app.getHttpServer()).get('/health/live').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');

      // El liveness check verifica memoria
      expect(response.body.details).toHaveProperty('memory_heap');
      expect(response.body.details.memory_heap.status).toBe('up');
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const response = await request(app.getHttpServer()).get('/health/detailed').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');

      // Verificar componentes principales
      expect(response.body.details).toHaveProperty('database');
      expect(response.body.details).toHaveProperty('database_detailed');
      expect(response.body.details).toHaveProperty('memory_heap');
      expect(response.body.details).toHaveProperty('memory_rss');
      expect(response.body.details).toHaveProperty('storage');

      // Todos deben estar UP
      expect(response.body.details.database.status).toBe('up');
      expect(response.body.details.database_detailed.status).toBe('up');
      expect(response.body.details.memory_heap.status).toBe('up');
      expect(response.body.details.memory_rss.status).toBe('up');
      expect(response.body.details.storage.status).toBe('up');
    });
  });
});
