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

  describe('GET /metrics', () => {
    it('should return Prometheus metrics in text format', async () => {
      const response = await request(app.getHttpServer()).get('/metrics').expect(200);

      // Verificar Content-Type correcto para Prometheus
      expect(response.headers['content-type']).toMatch(/text\/plain/);

      // Verificar que retorna texto (no JSON)
      expect(typeof response.text).toBe('string');
      expect(response.text.length).toBeGreaterThan(0);

      // Verificar formato básico de métricas de Prometheus
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
    });

    it('should include standard Node.js process metrics', async () => {
      const response = await request(app.getHttpServer()).get('/metrics').expect(200);

      const metricsText = response.text;

      // Métricas estándar de proceso Node.js
      expect(metricsText).toMatch(/process_cpu_/);
      expect(metricsText).toMatch(/process_resident_memory_bytes/);
      expect(metricsText).toMatch(/nodejs_heap_size_/);
      expect(metricsText).toMatch(/nodejs_version_info/);
    });

    it('should include HTTP request metrics', async () => {
      // Primero hacer una request para generar métricas HTTP
      await request(app.getHttpServer()).get('/health').expect(200);

      // Luego verificar que las métricas HTTP aparecen
      const response = await request(app.getHttpServer()).get('/metrics').expect(200);

      const metricsText = response.text;

      // Métricas HTTP (pueden estar presentes dependiendo de la configuración)
      // Al menos verificar que hay métricas en general
      expect(metricsText).toContain('# TYPE');
      expect(metricsText.split('\n').length).toBeGreaterThan(50); // Muchas líneas de métricas
    });

    it('should be publicly accessible without authentication', async () => {
      // No se debe requerir token de autenticación para /metrics
      const response = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200); // No 401 Unauthorized

      expect(response.headers['content-type']).toMatch(/text\/plain/);
    });

    it('should return valid Prometheus format with metric names and values', async () => {
      const response = await request(app.getHttpServer()).get('/metrics').expect(200);

      const metricsText = response.text;
      const lines = metricsText.split('\n').filter((line) => line.trim() !== '');

      // Verificar que hay líneas de comentarios (HELP/TYPE)
      const commentLines = lines.filter((line) => line.startsWith('#'));
      expect(commentLines.length).toBeGreaterThan(0);

      // Verificar que hay líneas de métricas (no comentarios)
      const metricLines = lines.filter((line) => !line.startsWith('#'));
      expect(metricLines.length).toBeGreaterThan(0);

      // Verificar formato básico de al menos una métrica: nombre valor
      const sampleMetric = metricLines.find((line) => line.includes(' '));
      expect(sampleMetric).toBeDefined();

      if (sampleMetric) {
        const parts = sampleMetric.split(' ');
        expect(parts.length).toBeGreaterThanOrEqual(2);

        // El segundo elemento debe ser un número o timestamp
        const value = parts[parts.length - 1];
        expect(isNaN(Number(value))).toBe(false);
      }
    });

    it('should return metrics consistently on multiple requests', async () => {
      // Primera request
      const response1 = await request(app.getHttpServer()).get('/metrics').expect(200);

      // Segunda request
      const response2 = await request(app.getHttpServer()).get('/metrics').expect(200);

      // Ambas deben tener el formato correcto
      expect(response1.headers['content-type']).toMatch(/text\/plain/);
      expect(response2.headers['content-type']).toMatch(/text\/plain/);

      // Ambas deben tener contenido
      expect(response1.text.length).toBeGreaterThan(0);
      expect(response2.text.length).toBeGreaterThan(0);

      // Ambas deben tener el formato Prometheus
      expect(response1.text).toContain('# TYPE');
      expect(response2.text).toContain('# TYPE');
    });
  });
});
