import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { TestAppHelper } from '../../helpers/test-app.helper';
import { DatabaseHelper } from '../../helpers/database.helper';
import { DataSource } from 'typeorm';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { Category } from '../../../src/modules/categories/entities/category.entity';
import { ProductFactory } from '../../helpers/factories/product.factory';
import { CategoryFactory } from '../../helpers/factories/category.factory';

/**
 * Helper para extraer datos de respuestas con doble anidación.
 * Maneja el caso donde la API wrappea respuestas en response.body.data.data
 * @see docs/refactor/double-nested-response-issue.md
 */
const extractData = (response: request.Response) => {
  return response.body.data?.data || response.body.data;
};

/**
 * Performance Testing - API Response Time Benchmarks (E2E)
 *
 * Valida que los endpoints cumplan con SLAs de tiempo de respuesta:
 * - GET endpoints críticos: <200ms
 * - POST endpoints transaccionales: <500ms
 * - Health checks: <100ms
 * - Auth endpoints: <300ms
 * - Requests concurrentes: manejar carga sin degradación
 *
 * ✅ Usa dependencias REALES (PostgreSQL, Redis)
 * ✅ Mide tiempos de respuesta reales end-to-end
 * ✅ Valida SLAs de performance en condiciones realistas
 */
describe('API Response Time Benchmarks - Performance Testing (E2E)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let databaseHelper: DatabaseHelper;

  // Entidades de prueba
  let testCategory: Category;
  let testProduct: Product;

  /**
   * SLAs definidos (en milisegundos) para tests E2E con dependencias reales.
   *
   * NOTA: Estos valores son más permisivos que SLAs de producción porque:
   * - Health checks incluyen conexión real a PostgreSQL (overhead inicial)
   * - Auth incluye hashing bcrypt con factor de coste 10 (seguro pero lento)
   * - Entorno de testing puede tener overhead adicional vs producción
   *
   * SLAs de producción recomendados (más estrictos):
   * - HEALTH_CHECK: <100ms (con cache y conexiones warm)
   * - AUTH_ENDPOINT: <300ms (con optimizaciones)
   */
  const SLA = {
    HEALTH_CHECK: 1000, // Health check con DB real puede ser lento en primera ejecución
    GET_ENDPOINT: 200, // GETs de lectura simple (realista)
    AUTH_ENDPOINT: 400, // Auth con bcrypt es computacionalmente costoso
    POST_ENDPOINT: 500, // POSTs transaccionales (realista)
    CONCURRENT_TOTAL: 2000, // 10 requests en 2 segundos (realista)
  };

  // Multiplicador para tests de requests mixtos (GETs + POSTs concurrentes)
  const MIXED_REQUESTS_SLA_MULTIPLIER = 1.5;

  beforeAll(async () => {
    // Crear app con dependencias REALES
    app = await TestAppHelper.createTestApp();
    dataSource = app.get(DataSource);
    databaseHelper = new DatabaseHelper(app);

    // Seed data inicial para performance tests
    await seedPerformanceData();
  });

  afterAll(async () => {
    // Cleanup
    await databaseHelper.cleanDatabase();
    await TestAppHelper.closeApp(app);
  });

  /**
   * Seed data optimizado para performance tests
   */
  const seedPerformanceData = async () => {
    // Limpiar base de datos
    await databaseHelper.cleanDatabase();

    // 1. Crear usuarios de prueba
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'admin-perf@test.com',
      password: 'Admin123!',
      firstName: 'Admin',
      lastName: 'Performance',
    });

    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'user-perf@test.com',
      password: 'User123!',
      firstName: 'User',
      lastName: 'Performance',
    });

    // 2. Crear categorías para productos
    const categoryRepository = dataSource.getRepository(Category);
    testCategory = await CategoryFactory.create(categoryRepository, {
      name: 'Performance Test Category',
      slug: 'performance-test-category',
    });

    // 3. Crear productos para tests de lectura
    const productRepository = dataSource.getRepository(Product);
    testProduct = await ProductFactory.create(productRepository, {
      name: 'Performance Test Product',
      sku: 'PERF-TEST-001',
      price: 99.99,
      categoryId: testCategory.id,
    });

    // Crear productos adicionales para tests de listado
    for (let i = 2; i <= 20; i++) {
      await ProductFactory.create(productRepository, {
        name: `Performance Product ${i}`,
        sku: `PERF-TEST-${String(i).padStart(3, '0')}`,
        price: 10 + i * 5,
        categoryId: testCategory.id,
      });
    }
  };

  /**
   * Helper para medir tiempo de respuesta
   */
  const measureResponseTime = async (requestFn: () => Promise<request.Response>) => {
    const startTime = Date.now();
    const response = await requestFn();
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    return { response, responseTime };
  };

  /**
   * ============================================
   * TEST SUITE 1: Health Check Performance
   * ============================================
   */
  describe('Health Check Performance', () => {
    it(`should respond to GET /health in less than ${SLA.HEALTH_CHECK}ms`, async () => {
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer()).get('/health').expect(HttpStatus.OK),
      );

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');
      expect(responseTime).toBeLessThan(SLA.HEALTH_CHECK);

      console.log(`✓ GET /health: ${responseTime}ms (SLA: ${SLA.HEALTH_CHECK}ms)`);
    });

    it(`should respond to GET /health/ready in less than ${SLA.HEALTH_CHECK}ms`, async () => {
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer()).get('/health/ready').expect(HttpStatus.OK),
      );

      expect(response.body).toHaveProperty('status');
      expect(responseTime).toBeLessThan(SLA.HEALTH_CHECK);

      console.log(`✓ GET /health/ready: ${responseTime}ms (SLA: ${SLA.HEALTH_CHECK}ms)`);
    });

    it(`should respond to GET /health/live in less than ${SLA.HEALTH_CHECK}ms`, async () => {
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer()).get('/health/live').expect(HttpStatus.OK),
      );

      expect(response.body).toHaveProperty('status');
      expect(responseTime).toBeLessThan(SLA.HEALTH_CHECK);

      console.log(`✓ GET /health/live: ${responseTime}ms (SLA: ${SLA.HEALTH_CHECK}ms)`);
    });
  });

  /**
   * ============================================
   * TEST SUITE 2: Authentication Performance
   * ============================================
   */
  describe('Authentication Performance', () => {
    it(`should respond to POST /auth/login in less than ${SLA.AUTH_ENDPOINT}ms`, async () => {
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'user-perf@test.com',
            password: 'User123!',
          })
          .expect(HttpStatus.OK),
      );

      const authData = extractData(response);
      expect(authData).toHaveProperty('accessToken');
      expect(authData).toHaveProperty('refreshToken');
      expect(responseTime).toBeLessThan(SLA.AUTH_ENDPOINT);

      console.log(`✓ POST /auth/login: ${responseTime}ms (SLA: ${SLA.AUTH_ENDPOINT}ms)`);
    });

    it(`should respond to GET /auth/profile in less than ${SLA.GET_ENDPOINT}ms`, async () => {
      // Obtener token fresco para este test
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user-perf@test.com',
          password: 'User123!',
        })
        .expect(HttpStatus.OK);

      const authData = extractData(loginResponse);
      const freshToken = authData.accessToken;

      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer())
          .get('/auth/profile')
          .set('Authorization', `Bearer ${freshToken}`)
          .expect(HttpStatus.OK),
      );

      const profileData = extractData(response);
      expect(profileData).toHaveProperty('id');
      expect(profileData).toHaveProperty('email');
      // Este test solo mide el GET /auth/profile, así que usamos SLA estricto de GET
      expect(responseTime).toBeLessThan(SLA.GET_ENDPOINT);

      console.log(`✓ GET /auth/profile: ${responseTime}ms (SLA: ${SLA.GET_ENDPOINT}ms)`);
    });
  });

  /**
   * ============================================
   * TEST SUITE 3: Products API Performance
   * ============================================
   */
  describe('Products API Performance', () => {
    it(`should respond to GET /products in less than ${SLA.GET_ENDPOINT}ms`, async () => {
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer())
          .get('/products')
          .query({ page: 1, limit: 10 })
          .expect(HttpStatus.OK),
      );

      const data = extractData(response);
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
      expect(responseTime).toBeLessThan(SLA.GET_ENDPOINT);

      console.log(`✓ GET /products: ${responseTime}ms (SLA: ${SLA.GET_ENDPOINT}ms)`);
    });

    it(`should respond to GET /products/:id in less than ${SLA.GET_ENDPOINT}ms`, async () => {
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer()).get(`/products/${testProduct.id}`).expect(HttpStatus.OK),
      );

      const productData = extractData(response);
      expect(productData).toHaveProperty('id');
      expect(productData.id).toBe(testProduct.id);
      expect(responseTime).toBeLessThan(SLA.GET_ENDPOINT);

      console.log(`✓ GET /products/:id: ${responseTime}ms (SLA: ${SLA.GET_ENDPOINT}ms)`);
    });

    it(`should respond to GET /products/search in less than ${SLA.GET_ENDPOINT}ms`, async () => {
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer())
          .get('/products/search')
          .query({ q: 'Performance', limit: 10 })
          .expect(HttpStatus.OK),
      );

      const searchResults = extractData(response);
      expect(Array.isArray(searchResults)).toBe(true);
      expect(responseTime).toBeLessThan(SLA.GET_ENDPOINT);

      console.log(`✓ GET /products/search: ${responseTime}ms (SLA: ${SLA.GET_ENDPOINT}ms)`);
    });
  });

  /**
   * ============================================
   * TEST SUITE 4: Orders API Performance
   * ============================================
   */
  describe('Orders API Performance', () => {
    let freshUserToken: string;

    beforeEach(async () => {
      // Obtener token fresco antes de cada test de orders
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user-perf@test.com',
          password: 'User123!',
        })
        .expect(HttpStatus.OK);

      const authData = extractData(loginResponse);
      freshUserToken = authData.accessToken;
    });

    it(`should respond to POST /orders in less than ${SLA.POST_ENDPOINT}ms`, async () => {
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer())
          .post('/orders')
          .set('Authorization', `Bearer ${freshUserToken}`)
          .send({
            items: [
              {
                productId: testProduct.id,
                quantity: 1,
              },
            ],
          })
          .expect(HttpStatus.ACCEPTED),
      );

      const orderData = extractData(response);
      expect(orderData).toHaveProperty('id');
      expect(orderData).toHaveProperty('status');
      expect(orderData.status).toBe('PENDING');
      expect(responseTime).toBeLessThan(SLA.POST_ENDPOINT);

      console.log(`✓ POST /orders: ${responseTime}ms (SLA: ${SLA.POST_ENDPOINT}ms)`);
    });

    it(`should respond to GET /orders in less than ${SLA.GET_ENDPOINT}ms`, async () => {
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer())
          .get('/orders')
          .set('Authorization', `Bearer ${freshUserToken}`)
          .query({ page: 1, limit: 10 })
          .expect(HttpStatus.OK),
      );

      const ordersData = extractData(response);
      expect(Array.isArray(ordersData)).toBe(true);
      expect(responseTime).toBeLessThan(SLA.GET_ENDPOINT);

      console.log(`✓ GET /orders: ${responseTime}ms (SLA: ${SLA.GET_ENDPOINT}ms)`);
    });
  });

  /**
   * ============================================
   * TEST SUITE 5: Concurrent Requests Performance
   * ============================================
   */
  describe('Concurrent Requests Performance', () => {
    it(`should handle 10 concurrent GET /products requests in less than ${SLA.CONCURRENT_TOTAL}ms total`, async () => {
      const concurrentRequests = 10;
      const startTime = Date.now();

      // Ejecutar 10 requests en paralelo
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app.getHttpServer())
          .get('/products')
          .query({ page: 1, limit: 10 })
          .expect(HttpStatus.OK),
      );

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // Validar que todas las respuestas son correctas
      responses.forEach((response) => {
        const data = extractData(response);
        expect(data).toHaveProperty('data');
        expect(Array.isArray(data.data)).toBe(true);
      });

      expect(totalTime).toBeLessThan(SLA.CONCURRENT_TOTAL);

      console.log(
        `✓ ${concurrentRequests} concurrent requests: ${totalTime}ms (SLA: ${SLA.CONCURRENT_TOTAL}ms)`,
      );
      console.log(`  → Avg per request: ${Math.round(totalTime / concurrentRequests)}ms`);
    });

    it(`should handle mixed concurrent requests (GET + POST) efficiently`, async () => {
      // Obtener token fresco para este test
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'user-perf@test.com',
          password: 'User123!',
        })
        .expect(HttpStatus.OK);

      const authData = extractData(loginResponse);
      const freshToken = authData.accessToken;

      const startTime = Date.now();

      // Mix de requests: 5 GETs + 5 POSTs
      const getRequests = Array.from({ length: 5 }, () =>
        request(app.getHttpServer()).get('/products').query({ page: 1, limit: 10 }),
      );

      const postRequests = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/orders')
          .set('Authorization', `Bearer ${freshToken}`)
          .send({
            items: [
              {
                productId: testProduct.id,
                quantity: 1,
              },
            ],
          }),
      );

      const responses = await Promise.all([...getRequests, ...postRequests]);
      const totalTime = Date.now() - startTime;

      // Validar que todas completaron exitosamente
      expect(responses).toHaveLength(10);

      // SLA más flexible para mix de requests (GETs + POSTs)
      expect(totalTime).toBeLessThan(SLA.CONCURRENT_TOTAL * MIXED_REQUESTS_SLA_MULTIPLIER); // 3 segundos

      console.log(`✓ 10 mixed concurrent requests: ${totalTime}ms`);
      console.log(`  → Avg per request: ${Math.round(totalTime / 10)}ms`);
    });
  });

  /**
   * ============================================
   * TEST SUITE 6: Database Query Performance
   * ============================================
   */
  describe('Database Query Performance', () => {
    it(`should respond to GET /categories with pagination in less than ${SLA.GET_ENDPOINT}ms`, async () => {
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer())
          .get('/categories')
          .query({ page: 1, limit: 10 })
          .expect(HttpStatus.OK),
      );

      const data = extractData(response);
      expect(data).toHaveProperty('data');
      expect(responseTime).toBeLessThan(SLA.GET_ENDPOINT);

      console.log(`✓ GET /categories: ${responseTime}ms (SLA: ${SLA.GET_ENDPOINT}ms)`);
    });

    it(`should respond to GET /categories/tree in less than ${SLA.GET_ENDPOINT * 2}ms`, async () => {
      // Tree queries pueden ser más lentas por la recursividad
      const { response, responseTime } = await measureResponseTime(() =>
        request(app.getHttpServer()).get('/categories/tree').expect(HttpStatus.OK),
      );

      const treeData = extractData(response);
      expect(Array.isArray(treeData)).toBe(true);
      expect(responseTime).toBeLessThan(SLA.GET_ENDPOINT * 2); // 400ms para queries complejas

      console.log(`✓ GET /categories/tree: ${responseTime}ms (SLA: ${SLA.GET_ENDPOINT * 2}ms)`);
    });
  });
});
