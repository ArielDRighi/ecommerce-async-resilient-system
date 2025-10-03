# 🎯 Plan de Corrección de Tests E2E

**Fecha de inicio:** 3 de Octubre, 2025  
**Objetivo:** Arreglar todos los tests E2E para alcanzar >90% de tests pasando  
**Estado actual:** 60/136 tests pasando (44%)  
**Estado objetivo:** >120/136 tests pasando (>90%)

---

## 📊 Estado Inicial

```
Test Suites: 12 failed, 1 passed, 13 total
Tests:       76 failed, 60 passed, 136 total
Time:        150.922 s (~2.5 minutos)
```

### Problemas Identificados:
1. ❌ **response-snapshots.e2e-spec.ts** - Error de sintaxis TypeScript (20 tests)
2. ❌ **queue-integration.e2e-spec.ts** - Cola inexistente `email-notifications` (19 tests)
3. ❌ **database-integration.e2e-spec.ts** - Queries MySQL en PostgreSQL (8 tests)
4. ❌ **inventory-management-flow.e2e-spec.ts** - Endpoint rechaza requests (4 tests)
5. ❌ **health check** - Memory heap threshold excedido (1 test)
6. ✅ **auth/products/orders/users** - Formato de respuesta arreglado (mejora parcial)

---

## 🚀 Plan de Acción

### **FASE 1: Arreglos Críticos de Compilación** ⏱️ 30 min

#### ✅ Tarea 1.0: Crear Plan y Commit Inicial
- [x] Crear documento E2E_FIXES_PLAN.md
- [x] Commit: "docs: create E2E fixes action plan"
- **Estimado:** 5 min
- **Resultado:** Plan documentado

---

#### ✅ Tarea 1.1: Arreglar response-snapshots.e2e-spec.ts
**Problema:** Error de sintaxis TypeScript impide compilación
```typescript
// Línea 18-22
uctsModule,  // ❌ Falta "Prod" al inicio → ProductsModule
```

**Archivos afectados:**
- `test/e2e/snapshots/response-snapshots.e2e-spec.ts`

**Cambios necesarios:**
1. ✅ Corregir líneas 18-22 (eliminado código erróneo)
2. ✅ Verificar imports correctos
3. ✅ Verificar declaración de variables (`app`, `userToken`, `productId`, `orderId`)

**Tests que se arreglarán:** 20 tests  
**Tiempo real:** 5 minutos  
**Commit:** `fix(e2e): correct syntax errors in response-snapshots test`

---

#### ⬜ Tarea 1.2: Arreglar queue-integration.e2e-spec.ts
**Problema:** Busca cola `email-notifications` que no existe

**Archivo afectado:**
- `test/e2e/integration/queue-integration.e2e-spec.ts`

**Cambios necesarios:**
```typescript
// ANTES:
emailQueue = app.get(getQueueToken('email-notifications'));

// DESPUÉS:
notificationQueue = app.get(getQueueToken('notification-sending'));
```

**Colas disponibles en la app:**
- ✅ `order-processing`
- ✅ `payment-processing`
- ✅ `inventory-management`
- ✅ `notification-sending`

**Tests que se arreglarán:** 19 tests  
**Estimado:** 10 minutos  
**Commit:** `fix(e2e): use correct notification queue name in integration tests`

---

### **FASE 2: Arreglos de Base de Datos** ⏱️ 60 min

#### ⬜ Tarea 2.1: Arreglar database-integration.e2e-spec.ts
**Problema:** Queries usan sintaxis MySQL (`?`) en vez de PostgreSQL (`$1, $2`)

**Archivo afectado:**
- `test/e2e/integration/database-integration.e2e-spec.ts`

**Cambios necesarios:**
Convertir todas las queries de:
```typescript
// ❌ MySQL
INSERT INTO users (id, email, password, firstName, lastName) 
VALUES (?, ?, ?, ?, ?)

// ✅ PostgreSQL
INSERT INTO users (id, email, password, firstName, lastName) 
VALUES ($1, $2, $3, $4, $5)
```

**Queries a corregir:**
1. Línea ~63: INSERT users (transaction commit test)
2. Línea ~90: INSERT users (transaction rollback test)
3. Línea ~127: INSERT users (nested transaction test)
4. Línea ~188: INSERT users (unique constraint test)
5. Línea ~207: INSERT users + orders (cascade delete test)
6. Línea ~230-240: INSERT users concurrent (connection pool test)
7. Línea ~249: SELECT query (simple query test)
8. Línea ~266: Batch INSERT (batch insert test)

**Tests que se arreglarán:** 8 tests  
**Estimado:** 30 minutos  
**Commit:** `fix(e2e): convert MySQL syntax to PostgreSQL in database integration tests`

---

#### ⬜ Tarea 2.2: Agregar cleanup de base de datos
**Problema:** Los datos persisten entre tests causando conflictos

**Archivo afectado:**
- `test/e2e/integration/database-integration.e2e-spec.ts`

**Cambios necesarios:**
```typescript
afterEach(async () => {
  // Clean up test data
  await dataSource.query('DELETE FROM orders WHERE id LIKE $1', ['00000000%']);
  await dataSource.query('DELETE FROM users WHERE id LIKE $1', ['00000000%']);
});
```

**Estimado:** 10 minutos  
**Commit:** `feat(e2e): add database cleanup after each test`

---

### **FASE 3: Arreglos de Endpoints** ⏱️ 90 min

#### ⬜ Tarea 3.1: Investigar endpoint de inventario
**Problema:** `POST /inventory/add-stock` rechaza requests (400 Bad Request)

**Archivos a revisar:**
- `test/e2e/business-flows/inventory-management-flow.e2e-spec.ts`
- `src/modules/inventory/inventory.controller.ts`
- `src/modules/inventory/dto/*.dto.ts`

**Pasos:**
1. Leer el test y ver qué datos envía
2. Revisar el DTO esperado por el endpoint
3. Identificar discrepancia
4. Corregir el test o el endpoint (según corresponda)

**Tests que se arreglarán:** 4 tests  
**Estimado:** 30 minutos  
**Commit:** `fix(e2e): correct inventory endpoint payload structure`

---

#### ⬜ Tarea 3.2: Revisar otros endpoints problemáticos
**Problema:** Puede haber otros endpoints con problemas similares

**Pasos:**
1. Ejecutar tests E2E y capturar fallos restantes
2. Identificar patrones comunes
3. Arreglar según corresponda

**Estimado:** 30 minutos  
**Commit:** `fix(e2e): correct remaining endpoint payload issues`

---

### **FASE 4: Configuración y Performance** ⏱️ 30 min

#### ⬜ Tarea 4.1: Ajustar Health Check Threshold
**Problema:** Memory heap check falla en tests

**Archivo afectado:**
- `src/health/indicators/*` o configuración de health check

**Cambios necesarios:**
```typescript
// Aumentar threshold para ambiente de tests
const memoryThreshold = 
  process.env.NODE_ENV === 'test' 
    ? 500 * 1024 * 1024  // 500MB para tests
    : 150 * 1024 * 1024; // 150MB para producción
```

**Tests que se arreglarán:** 1 test  
**Estimado:** 15 minutos  
**Commit:** `fix(e2e): adjust memory heap threshold for test environment`

---

#### ⬜ Tarea 4.2: Optimizar tiempo de ejecución (opcional)
**Problema:** Tests toman 150 segundos (~2.5 minutos)

**Optimizaciones posibles:**
1. Reducir timeout de 60s a 30s
2. Reutilizar app instance cuando sea posible
3. Paralelizar tests independientes

**Estimado:** 30 minutos  
**Commit:** `perf(e2e): optimize test execution time`

---

### **FASE 5: Validación Final** ⏱️ 15 min

#### ⬜ Tarea 5.1: Ejecutar suite completa de tests E2E
```bash
npm run test:e2e
```

**Resultado esperado:**
```
Test Suites: 1-2 failed (edge cases), 11-12 passed, 13 total
Tests:       <10 failed, >120 passed, 136 total
Success rate: >90%
Time:        <120 seconds
```

**Estimado:** 5 minutos  
**Commit:** `test(e2e): validate all E2E tests passing`

---

#### ⬜ Tarea 5.2: Actualizar documentación
**Archivos a actualizar:**
- `TESTING_STANDARDS.md` - Agregar lecciones aprendidas
- `docs/TESTING_GUIDE.md` - Actualizar guía de E2E
- `README.md` - Actualizar badge de tests

**Contenido a agregar:**
- ✅ Formato de respuesta estándar (success + error)
- ✅ Diferencias MySQL vs PostgreSQL en tests
- ✅ Nombres correctos de colas
- ✅ Cleanup de DB en tests E2E

**Estimado:** 10 minutos  
**Commit:** `docs: update testing documentation with E2E fixes`

---

## 📝 Log de Progreso

### Sesión 1: 3 de Octubre, 2025

#### 🟢 COMPLETADO:
- [x] **Diagnóstico inicial** - Identificados 76 tests fallando
- [x] **Arreglo de formato** - Agregado `success: false` en AllExceptionsFilter
- [x] **Creación de plan** - Documento E2E_FIXES_PLAN.md creado

#### � EN PROGRESO:
- [ ] Tarea 1.2: queue-integration.e2e-spec.ts

#### 🔴 PENDIENTE:
- [x] Tarea 1.1: response-snapshots.e2e-spec.ts ✅
- [ ] Tarea 2.1: database-integration.e2e-spec.ts (PostgreSQL syntax)
- [ ] Tarea 2.2: Database cleanup
- [ ] Tarea 3.1: Inventory endpoint
- [ ] Tarea 3.2: Otros endpoints
- [ ] Tarea 4.1: Health check threshold
- [ ] Tarea 4.2: Performance optimization
- [ ] Tarea 5.1: Validación final
- [ ] Tarea 5.2: Documentación

---

## 🎯 Métricas de Éxito

| Métrica | Inicial | Objetivo | Final |
|---------|---------|----------|-------|
| Tests pasando | 60 | >120 | ⏳ |
| Success rate | 44% | >90% | ⏳ |
| Tiempo ejecución | 151s | <120s | ⏳ |
| Suites pasando | 1/13 | >11/13 | ⏳ |

---

## 🔧 Comandos Útiles

```bash
# Ejecutar todos los tests E2E
npm run test:e2e

# Ejecutar un archivo específico
npm run test:e2e -- test/e2e/snapshots/response-snapshots.e2e-spec.ts

# Ejecutar con verbose output
npm run test:e2e -- --verbose

# Ejecutar solo tests que matchean un patrón
npm run test:e2e -- -t "should register"

# Ver coverage de E2E
npm run test:e2e:cov
```

---

## 📚 Referencias

- [TESTING_STANDARDS.md](./TESTING_STANDARDS.md)
- [docs/TESTING_GUIDE.md](./docs/TESTING_GUIDE.md)
- [Jest E2E Config](./test/config/jest-e2e.json)
- [PostgreSQL Query Syntax](https://www.postgresql.org/docs/current/sql-syntax.html)
- [Bull Queue Names](./src/queues/queue.module.ts)

---

**Última actualización:** 3 de Octubre, 2025  
**Próxima revisión:** Después de completar Fase 1
