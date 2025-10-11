# ADR-021: Supertest para Testing E2E de API

**Estado:** Aceptado  
**Fecha:** 2024-01-17  
**Autor:** Equipo de Desarrollo  
**ADRs Relacionados:** ADR-020 (Jest), ADR-005 (NestJS)

---

## Contexto

Se necesita testear endpoints de API HTTP end-to-end con requests reales, asegurando que autenticación, validación y manejo de errores funcionen correctamente.

---

## Decisión

Usar **Supertest 6.x** para testing HTTP:

```typescript
/**
 * Ejemplo de Test E2E
 * Ubicación: test/e2e/orders.e2e-spec.ts
 */
import * as request from 'supertest';

describe('Orders API (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    // Crear app de prueba
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    app = module.createNestApplication();

    // Aplicar el mismo middleware que main.ts
    app.use(helmet());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe());

    await app.init();

    // Autenticar usuario de prueba
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'Test123!' })
      .expect(200);

    accessToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /orders', () => {
    it('debería crear orden con datos válidos', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [{ productId: 'uuid-123', quantity: 2 }],
          shippingAddress: {
            street: '123 Main St',
            city: 'Boston',
            country: 'US',
          },
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        status: 'pending',
        userId: expect.any(String),
        items: expect.arrayContaining([
          expect.objectContaining({
            productId: 'uuid-123',
            quantity: 2,
          }),
        ]),
      });
    });

    it('debería rechazar orden sin autenticación', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .send({
          items: [{ productId: 'uuid-123', quantity: 2 }],
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Access token is required');
        });
    });

    it('debería validar campos requeridos', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [], // Items vacíos (inválido)
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('items should not be empty');
        });
    });
  });

  describe('GET /orders/:id', () => {
    let orderId: string;

    beforeEach(async () => {
      // Crear orden para test
      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validOrderDto);

      orderId = response.body.id;
    });

    it('debería obtener orden por id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(orderId);
    });

    it('debería retornar 404 para orden inexistente', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/orders/non-existent-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
```

---

## Patrones de Testing

**Setup/Teardown:**

```typescript
beforeAll(async () => {
  // Crear app, login, seed data
});

beforeEach(async () => {
  // Limpiar tablas de base de datos
  await cleanupDatabase();
});

afterAll(async () => {
  // Cerrar app, cleanup
  await app.close();
});
```

**Helper de Autenticación:**

```typescript
async function authenticateUser(role: UserRole = UserRole.CUSTOMER) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: `${role}@test.com`, password: 'Test123!' });

  return response.body.accessToken;
}
```

**Seeding de Base de Datos:**

```typescript
async function seedTestData() {
  const user = await userRepository.save(mockUser);
  const product = await productRepository.save(mockProduct);
  return { user, product };
}
```

---

## Assertions

**Response Body:**

```typescript
expect(response.body).toMatchObject({
  id: expect.any(String),
  status: 'pending',
});
```

**Headers:**

```typescript
expect(response.headers['content-type']).toContain('application/json');
expect(response.headers['x-correlation-id']).toBeDefined();
```

**Array Matching:**

```typescript
expect(response.body.items).toHaveLength(2);
expect(response.body.items).toContainEqual(expect.objectContaining({ productId: 'uuid-123' }));
```

---

## Beneficios

✅ **HTTP Requests Reales:** Testea ciclo completo de request/response  
✅ **API Encadenable:** Métodos `.set()`, `.send()`, `.expect()`  
✅ **Type-Safe:** Soporte completo de TypeScript  
✅ **Integración con Jest:** Se ejecuta en suite de Jest

---

**Estado:** ✅ **IMPLEMENTADO Y OPERACIONAL**  
**Tests:** `test/e2e/*.e2e-spec.ts`  
**Configuración:** `test/config/jest-e2e.json`  
**Última Actualización:** 2024-01-17
