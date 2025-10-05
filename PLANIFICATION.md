# Sistema Procesador de Órdenes Asíncrono - Informe Técnico

## 1. Arquitectura General

### Stack Tecnológico

- **Framework**: NestJS 10.x con TypeScript 5.x
- **Base de Datos**: PostgreSQL 15+ con TypeORM 0.3.x
- **Message Queue**: Bull (Redis-based) para manejo de colas
- **Cache**: Redis 7.x
- **Autenticación**: JWT con Passport
- **Documentación**: Swagger/OpenAPI
- **Logging**: Winston con structured logging
- **Validación**: Class-validator y Class-transformer
- **Testing**: Jest con supertest
- **Monitoring**: Prometheus metrics (opcional)
- **Health Checks**: Terminus

### Patrones Implementados

- **Event Sourcing** (básico)
- **Outbox Pattern** para confiabilidad
- **CQRS** (Command Query Responsibility Segregation)
- **Saga Pattern** para orquestación
- **Circuit Breaker** para resilencia
- **Retry Pattern** con exponential backoff

## 2. Estructura de Archivos

```
src/
├── app.module.ts
├── main.ts
├── config/
│   ├── database.config.ts
│   ├── redis.config.ts
│   ├── jwt.config.ts
│   └── app.config.ts
├── common/
│   ├── decorators/
│   │   ├── idempotent.decorator.ts
│   │   └── current-user.decorator.ts
│   ├── filters/
│   │   └── all-exceptions.filter.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── idempotency.guard.ts
│   ├── interceptors/
│   │   ├── logging.interceptor.ts
│   │   └── timeout.interceptor.ts
│   ├── interfaces/
│   │   ├── queue-job.interface.ts
│   │   └── event.interface.ts
│   └── utils/
│       ├── logger.util.ts
│       └── retry.util.ts
├── database/
│   ├── migrations/
│   └── seeds/
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts
│   │   └── dto/
│   │       ├── login.dto.ts
│   │       └── register.dto.ts
│   ├── users/
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.module.ts
│   │   ├── entities/
│   │   │   └── user.entity.ts
│   │   └── dto/
│   │       └── create-user.dto.ts
│   ├── products/
│   │   ├── products.controller.ts
│   │   ├── products.service.ts
│   │   ├── products.module.ts
│   │   ├── entities/
│   │   │   └── product.entity.ts
│   │   └── dto/
│   │       ├── create-product.dto.ts
│   │       └── update-product.dto.ts
│   ├── orders/
│   │   ├── orders.controller.ts
│   │   ├── orders.service.ts
│   │   ├── orders.module.ts
│   │   ├── entities/
│   │   │   ├── order.entity.ts
│   │   │   └── order-item.entity.ts
│   │   ├── dto/
│   │   │   ├── create-order.dto.ts
│   │   │   └── order-response.dto.ts
│   │   ├── enums/
│   │   │   └── order-status.enum.ts
│   │   └── processors/
│   │       └── order.processor.ts
│   ├── payments/
│   │   ├── payments.service.ts
│   │   ├── payments.module.ts
│   │   ├── interfaces/
│   │   │   └── payment-provider.interface.ts
│   │   └── providers/
│   │       └── mock-payment.provider.ts
│   ├── inventory/
│   │   ├── inventory.service.ts
│   │   ├── inventory.module.ts
│   │   └── entities/
│   │       └── inventory.entity.ts
│   ├── notifications/
│   │   ├── notifications.service.ts
│   │   ├── notifications.module.ts
│   │   └── providers/
│   │       ├── email.provider.ts
│   │       └── sms.provider.ts
│   ├── events/
│   │   ├── events.module.ts
│   │   ├── entities/
│   │   │   └── outbox-event.entity.ts
│   │   ├── handlers/
│   │   │   └── order-created.handler.ts
│   │   ├── publishers/
│   │   │   └── event.publisher.ts
│   │   └── types/
│   │       └── order.events.ts
│   └── health/
│       ├── health.controller.ts
│       └── health.module.ts
├── queues/
│   ├── queue.module.ts
│   ├── processors/
│   │   ├── order-processing.processor.ts
│   │   ├── payment.processor.ts
│   │   ├── inventory.processor.ts
│   │   └── notification.processor.ts
│   └── jobs/
│       ├── process-order.job.ts
│       ├── verify-stock.job.ts
│       ├── process-payment.job.ts
│       └── send-notification.job.ts
└── test/
    ├── e2e/
    └── unit/
```

## 3. Diseño de Base de Datos

### Entidades y Relaciones

```sql
-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Products Table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Inventory Table
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(product_id)
);

-- Orders Table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    idempotency_key VARCHAR(255) UNIQUE,
    payment_id VARCHAR(255),
    processing_started_at TIMESTAMP,
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_orders_user_id (user_id),
    INDEX idx_orders_status (status),
    INDEX idx_orders_idempotency_key (idempotency_key)
);

-- Order Items Table
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,

    INDEX idx_order_items_order_id (order_id),
    INDEX idx_order_items_product_id (product_id)
);

-- Outbox Events Table (Outbox Pattern)
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_outbox_processed (processed),
    INDEX idx_outbox_aggregate (aggregate_id, aggregate_type)
);

-- Saga State Table (Para tracking de procesos)
CREATE TABLE saga_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saga_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    current_step VARCHAR(100) NOT NULL,
    state_data JSONB NOT NULL,
    completed BOOLEAN DEFAULT false,
    compensated BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_saga_aggregate (aggregate_id),
    INDEX idx_saga_type_completed (saga_type, completed)
);
```

### Estados de Orden

```typescript
export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}
```

## 4. Flujo de Procesamiento Asíncrono

### Flujo Principal

1. **POST /orders** → Crear orden con estado PENDING
2. **Publicar evento** OrderCreated en Outbox
3. **Responder 202 Accepted** inmediatamente
4. **Worker procesa** evento de forma asíncrona:
   - Verificar stock
   - Reservar inventario
   - Procesar pago
   - Enviar confirmación
   - Actualizar estado final

### Manejo de Fallos

- **Retry exponencial** para fallos transitorios
- **Dead Letter Queue** para fallos permanentes
- **Circuit Breaker** para servicios externos
- **Compensación** (Saga) para rollback

## 5. Backlog de Desarrollo

### FASE 1: Fundación del Proyecto

#### Tarea 1: Configuración del Repositorio GitHub

**Prompt para GitHub Copilot:**

```
Como experto en DevOps y mejores prácticas de desarrollo, ayúdame a configurar un repositorio profesional en GitHub:

1. Crear un README.md completo que incluya:
   - Descripción del proyecto (Sistema Procesador de Órdenes Asíncrono)
   - Arquitectura y stack tecnológico
   - Diagrama de arquitectura básico
   - Instrucciones de instalación y configuración
   - Comandos para desarrollo (start, build, test, lint)
   - Variables de entorno necesarias
   - Guía de contribución

2. Configurar .gitignore optimizado para NestJS:
   - node_modules, dist, build
   - .env files y secrets
   - IDE files (.vscode, .idea)
   - Logs y archivos temporales
   - OS specific files
   - Coverage reports

3. Crear estructura de branches:
   - main (producción)
   - develop (desarrollo)
   - feature/* (nuevas funcionalidades)
   - release/* (preparación de releases)
   - hotfix/* (correcciones urgentes)

4. Configurar branch protection rules:
   - Requerir PR reviews
   - Requerir checks de CI/CD
   - No permitir force push a main
   - Requerir branches actualizados

5. Templates para Issues y Pull Requests:
   - Bug report template
   - Feature request template
   - PR template con checklist

6. Configurar GitHub Labels para organización:
   - bug, enhancement, documentation
   - priority: high/medium/low
   - status: in-progress/review/blocked

El repositorio debe seguir las mejores prácticas de open source y facilitar la colaboración.
```

**Validaciones de Calidad:**

- Verificar que README.md sea claro y completo
- Validar que .gitignore no exponga información sensible
- Confirmar que branch protection rules estén activas
- Revisar que templates de PR e Issues estén configurados
- Asegurar que labels estén categorizados correctamente

#### Tarea 1.1 Configuración Inicial del Proyecto

**Prompt para GitHub Copilot:**

```
Como experto en NestJS y TypeScript, ayúdame a configurar un proyecto desde cero con las siguientes características:

1. Inicializar proyecto NestJS con TypeScript
2. Configurar package.json con las siguientes dependencias:
   - @nestjs/core, @nestjs/common, @nestjs/platform-express
   - @nestjs/typeorm, @nestjs/jwt, @nestjs/passport
   - @nestjs/swagger, @nestjs/bull, @nestjs/terminus
   - typeorm, pg, redis, bull
   - class-validator, class-transformer
   - winston, helmet, compression
   - jest, supertest para testing

3. Crear estructura de carpetas según arquitectura modular
4. Configurar tsconfig.json con paths y opciones estrictas
5. Configurar eslint y prettier para código consistente
6. Crear archivo .env.example con todas las variables necesarias
7. Configurar scripts npm para desarrollo, build y testing

Necesito que el setup sea profesional, escalable y siga las mejores prácticas de NestJS.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para verificar estilo de código
- Ejecutar `npm run lint:fix` para auto-corregir issues
- Verificar `npm run type-check` para validar tipos TypeScript
- Ejecutar `npm run format` para formatear código con Prettier
- Correr `npm run test` para validar setup de testing
- Verificar `npm run build` compila sin errores
- Confirmar que todas las dependencias estén correctamente instaladas
- Validar que .env.example contenga todas las variables necesarias

#### Tarea 2: Configuración de Base de Datos y Migraciones

**Prompt para GitHub Copilot:**

```
Como experto en TypeORM y PostgreSQL, ayúdame a configurar la conexión a base de datos:

1. Crear configuración TypeORM para PostgreSQL con:
   - Conexión usando variables de entorno
   - Configuración de migraciones automáticas
   - Logging de queries en desarrollo
   - Pool de conexiones optimizado

2. Crear las siguientes entidades con TypeORM:
   - User (id, email, passwordHash, firstName, lastName, isActive, timestamps)
   - Product (id, name, description, price, sku, isActive, timestamps)
   - Order (id, userId, status, totalAmount, currency, idempotencyKey, paymentId, timestamps)
   - OrderItem (id, orderId, productId, quantity, unitPrice, totalPrice)
   - Inventory (id, productId, quantity, reservedQuantity, updatedAt)
   - OutboxEvent (id, aggregateId, aggregateType, eventType, eventData, processed, timestamps)
   - SagaState (id, sagaType, aggregateId, currentStep, stateData, completed, compensated, timestamps)

3. Crear migraciones iniciales para todas las tablas
4. Configurar relaciones entre entidades con lazy loading
5. Añadir índices para optimización de consultas

Asegurar que siga las mejores prácticas de TypeORM y sea escalable.
```

#### Tarea 3: Sistema de Logging y Configuración

**Prompt para GitHub Copilot:**

```
Como experto en NestJS, ayúdame a implementar un sistema de logging robusto:

1. Configurar Winston logger con:
   - Formato estructurado (JSON) para producción
   - Formato readable para desarrollo
   - Rotación de logs por tamaño y fecha
   - Diferentes niveles de log (error, warn, info, debug)
   - Transport a archivo y consola

2. Crear interceptor de logging que capture:
   - Request/Response details
   - Tiempo de ejecución
   - Errores y stack traces
   - User context cuando esté disponible

3. Implementar configuración centralizada usando ConfigModule:
   - Variables de entorno tipadas
   - Validación de configuración al startup
   - Configuración por ambiente (dev, staging, prod)

4. Crear filtro global de excepciones que:
   - Log errores con contexto completo
   - Retorne respuestas consistentes
   - No exponga detalles internos en producción

El sistema debe ser observables y facilitar debugging en producción.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar estilo de código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios con `npm run test`
- Verificar que logging funcione en diferentes niveles
- Validar que configuración por ambiente funcione correctamente
- Confirmar que filtros de excepción manejen todos los casos de error

#### Tarea 4: Configuración de CI/CD Pipeline

**Prompt para GitHub Copilot:**

```
Como experto en GitHub Actions y DevOps, configura un pipeline completo de CI/CD:

1. Crear workflow de CI (.github/workflows/ci.yml):
   - Trigger en push a main/develop y PRs
   - Matrix testing en Node.js 18.x y 20.x
   - Instalar dependencias con cache
   - Ejecutar linting (eslint)
   - Verificar formato de código (prettier)
   - Validar tipos TypeScript
   - Ejecutar tests unitarios y e2e
   - Generar coverage report
   - Upload coverage a Codecov (opcional)

2. Crear workflow de CD (.github/workflows/cd.yml):
   - Trigger solo en push a main
   - Build de aplicación
   - Build de imagen Docker
   - Push a container registry
   - Deploy automático a staging
   - Manual approval para producción

3. Configurar quality gates:
   - Minimum code coverage 80%
   - Zero linting errors
   - Zero TypeScript errors
   - All tests must pass
   - Security scan con npm audit

4. Crear Dockerfile optimizado:
   - Multi-stage build para menor tamaño
   - Non-root user para seguridad
   - Health check endpoint
   - Optimizado para caché de layers

5. Configurar docker-compose para desarrollo:
   - Servicio de app NestJS
   - PostgreSQL database
   - Redis cache
   - Hot reload para desarrollo

6. Scripts de deployment:
   - Staging deployment automático
   - Production deployment manual
   - Rollback mechanism
   - Database migrations automáticas

7. Monitoring y notifications:
   - Slack notifications para deployments
   - GitHub status checks
   - Failure notifications

El pipeline debe ser confiable, rápido y proporcionar feedback inmediato al equipo.
```

**Validaciones de Calidad:**

- Verificar que todos los jobs del CI pasen correctamente
- Confirmar que quality gates bloqueen PRs con errores
- Validar que Docker build sea exitoso y optimizado
- Probar pipeline completo desde PR hasta deployment
- Verificar que rollback mechanism funcione
- Confirmar que notifications lleguen correctamente
- Validar que coverage report se genere y sea preciso

### FASE 2: Autenticación y Autorización

#### Tarea 5: Sistema de Autenticación JWT

**Prompt para GitHub Copilot:**

```
Como experto en NestJS y JWT, implementa un sistema completo de autenticación:

1. Crear módulo de autenticación con:
   - AuthController con endpoints login y register
   - AuthService con métodos de autenticación
   - JWT Strategy usando Passport
   - Guards para proteger rutas

2. Implementar funcionalidades:
   - Registro de usuarios con hash de password (bcrypt)
   - Login con validación de credenciales
   - Generación de JWT tokens con payload personalizado
   - Refresh token mechanism
   - Middleware de validación de tokens

3. Crear DTOs con validación:
   - LoginDto (email, password)
   - RegisterDto (email, password, firstName, lastName)
   - Validaciones robustas con class-validator

4. Implementar decorador @CurrentUser para extraer usuario del token
5. Crear guard reutilizable para proteger endpoints
6. Añadir documentación Swagger para todos los endpoints

Asegurar que la implementación sea segura y siga mejores prácticas de autenticación.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios de autenticación
- Validar que JWT tokens se generen correctamente
- Probar endpoints protegidos con Postman/Insomnia
- Verificar que refresh tokens funcionen
- Confirmar que password hashing sea seguro (bcrypt)
- Validar que decorador @CurrentUser funcione

#### Tarea 6: Módulo de Usuarios

**Prompt para GitHub Copilot:**

```
Como experto en NestJS, crea un módulo completo de gestión de usuarios:

1. Crear UsersModule con:
   - UsersController con endpoints CRUD
   - UsersService con lógica de negocio
   - UserEntity ya está definida, usar esa estructura

2. Implementar endpoints:
   - GET /users (con paginación y filtros)
   - GET /users/:id
   - POST /users (crear usuario)
   - PUT /users/:id (actualizar usuario)
   - DELETE /users/:id (soft delete)
   - GET /users/profile (perfil del usuario logueado)

3. Añadir DTOs:
   - CreateUserDto con validaciones
   - UpdateUserDto (partial de CreateUserDto)
   - UserResponseDto (sin password)
   - Queries DTOs para paginación y filtros

4. Implementar:
   - Validación de email único
   - Hash de passwords
   - Soft delete functionality
   - Paginación con cursor o offset
   - Filtros básicos de búsqueda

5. Proteger endpoints con autenticación JWT
6. Documentar con Swagger incluyendo ejemplos

Seguir principios REST y mejores prácticas de NestJS.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar estilo de código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios del módulo de usuarios
- Validar que endpoints CRUD funcionen correctamente
- Probar paginación y filtros con diferentes parámetros
- Verificar que soft delete funcione adecuadamente
- Confirmar que validaciones de email único funcionen
- Validar que documentación Swagger esté completa

### FASE 3: Gestión de Productos e Inventario

#### Tarea 7: Módulo de Productos

**Prompt para GitHub Copilot:**

```
Como experto en NestJS, implementa un módulo completo de productos:

1. Crear ProductsModule con:
   - ProductsController con endpoints CRUD completos
   - ProductsService con lógica de negocio
   - Usar ProductEntity ya definida

2. Implementar endpoints REST:
   - GET /products (con paginación, filtros, ordenamiento)
   - GET /products/:id
   - POST /products (solo admin)
   - PUT /products/:id (solo admin)
   - DELETE /products/:id (solo admin, soft delete)
   - GET /products/search?q=term (búsqueda full-text)

3. Crear DTOs robustos:
   - CreateProductDto (name, description, price, sku con validaciones)
   - UpdateProductDto (partial del anterior)
   - ProductResponseDto
   - ProductQueryDto (paginación, filtros, sorting)

4. Implementar características:
   - Validación de SKU único
   - Validación de precio positivo
   - Búsqueda por nombre y descripción
   - Filtros por rango de precio
   - Ordenamiento por diferentes campos
   - Cache de productos populares

5. Añadir documentación Swagger completa
6. Proteger endpoints de modificación con autenticación

El módulo debe ser performante y soportar catálogos grandes.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios y de integración
- Validar que búsqueda full-text funcione correctamente
- Probar filtros de precio y ordenamiento
- Verificar que SKU único se valide adecuadamente
- Confirmar que cache de productos funcione
- Validar performance con datasets grandes

**Tests de endpoints involucrados en la tarea con Curl:**

```bash
# 1. ENDPOINTS DE AUTENTICACIÓN
# Registrar nuevo usuario
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "Admin123!",
    "firstName": "Admin",
    "lastName": "User"
  }'

# Login y obtener JWT token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "Admin123!"
  }'

# 2. ENDPOINTS DE USUARIOS
# Obtener perfil del usuario (requiere token)
curl -X GET http://localhost:3000/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Listar usuarios con paginación
curl -X GET "http://localhost:3000/users?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Obtener usuario por ID
curl -X GET http://localhost:3000/users/USER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. ENDPOINTS DE PRODUCTOS (NUEVOS EN ESTA TAREA)
# Crear producto (solo admin)
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Laptop Gaming",
    "description": "Laptop para gaming de alta gama",
    "price": 1299.99,
    "sku": "LAP-001",
    "category": "Electronics",
    "brand": "TechBrand",
    "weight": 2.5,
    "costPrice": 800.00,
    "compareAtPrice": 1499.99,
    "trackInventory": true,
    "minimumStock": 5,
    "images": ["https://example.com/laptop1.jpg"],
    "tags": ["gaming", "laptop", "electronics"],
    "attributes": {"color": "black", "ram": "16GB", "storage": "1TB"}
  }'

# Listar productos con paginación y filtros
curl -X GET "http://localhost:3000/products?page=1&limit=10&category=Electronics&minPrice=100&maxPrice=2000&sortBy=price&sortOrder=asc"

# Obtener producto por ID
curl -X GET http://localhost:3000/products/PRODUCT_ID

# Buscar productos
curl -X GET "http://localhost:3000/products/search?q=laptop&limit=5"

# Actualizar producto (solo admin)
curl -X PUT http://localhost:3000/products/PRODUCT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Laptop Gaming Pro",
    "price": 1399.99,
    "description": "Laptop gaming mejorada"
  }'

# Activar producto (solo admin)
curl -X PATCH http://localhost:3000/products/PRODUCT_ID/activate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Desactivar producto (solo admin)
curl -X PATCH http://localhost:3000/products/PRODUCT_ID/deactivate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Eliminar producto - soft delete (solo admin)
curl -X DELETE http://localhost:3000/products/PRODUCT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 4. HEALTH CHECKS
# Health check general
curl -X GET http://localhost:3000/health

# Health check detallado
curl -X GET http://localhost:3000/health/detailed
```

**Notas importantes para testing:**

- Reemplazar `YOUR_JWT_TOKEN` con el token obtenido del endpoint de login
- Reemplazar `USER_ID` y `PRODUCT_ID` con IDs reales obtenidos de respuestas anteriores
- Verificar que endpoints protegidos rechacen requests sin token (401)
- Verificar que endpoints de admin rechacen usuarios no-admin (403)
- Probar validaciones de DTOs con datos inválidos
- Verificar respuestas de paginación y filtros
- Confirmar que soft delete no elimine físicamente los registros

#### Tarea 7.1: Módulo de Categorías

**Prompt para GitHub Copilot:**

```
Como experto en NestJS, implementa un módulo completo de categorías que trabaje como sistema independiente:

1. Crear CategoryModule con:
   - CategoryController con endpoints CRUD completos
   - CategoryService con lógica de negocio
   - CategoryEntity con estructura jerárquica (parent-child)

2. Diseñar CategoryEntity:
   - id (UUID primary key)
   - name (string, required, unique per level)
   - description (text, optional)
   - slug (string, required, unique, SEO-friendly)
   - parentId (UUID, foreign key a Category, nullable)
   - isActive (boolean, default true)
   - sortOrder (number, default 0)
   - metadata (jsonb, optional para datos adicionales)
   - timestamps (createdAt, updatedAt)

3. Implementar endpoints REST:
   - GET /categories (con soporte para árbol jerárquico)
   - GET /categories/tree (estructura completa del árbol)
   - GET /categories/:id
   - GET /categories/slug/:slug
   - POST /categories (solo admin)
   - PUT /categories/:id (solo admin)
   - DELETE /categories/:id (solo admin, verificar no tenga productos)
   - PATCH /categories/:id/activate (solo admin)
   - PATCH /categories/:id/deactivate (solo admin)

4. Crear DTOs robustos:
   - CreateCategoryDto (name, description, slug, parentId)
   - UpdateCategoryDto (partial del anterior)
   - CategoryResponseDto (incluir children, parent, productCount)
   - CategoryTreeDto (estructura jerárquica completa)
   - CategoryQueryDto (filtros, paginación, includeInactive)

5. Implementar características avanzadas:
   - Validación de slug único y SEO-friendly
   - Prevención de ciclos en jerarquía (no puede ser padre de sí misma)
   - Ordenamiento de categorías por sortOrder y name
   - Conteo de productos por categoría (opcional)
   - Cache de estructura de árbol para performance
   - Soft delete con verificación de dependencias

6. Funciones de utilidad en CategoryService:
   - buildCategoryTree(): construir árbol completo
   - getCategoryPath(categoryId): obtener ruta completa (breadcrumb)
   - getDescendants(categoryId): obtener todas las subcategorías
   - validateHierarchy(parentId, childId): prevenir ciclos
   - generateSlug(name): crear slug automático

7. Añadir documentación Swagger completa
8. Implementar índices de base de datos para performance

El módulo debe soportar jerarquías profundas y ser eficiente en consultas.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios para lógica de árbol
- Validar que jerarquía no permita ciclos
- Probar generación automática de slugs
- Verificar cache de árbol de categorías
- Validar performance con jerarquías profundas
- Confirmar soft delete no afecte productos relacionados

**Tests de endpoints con Curl:**

```bash
# 1. CREAR CATEGORÍAS
# Crear categoría raíz
curl -X POST http://localhost:3000/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Electronics",
    "description": "Electronic products and gadgets",
    "slug": "electronics"
  }'

# Crear subcategoría
curl -X POST http://localhost:3000/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Laptops",
    "description": "Laptop computers",
    "slug": "laptops",
    "parentId": "PARENT_CATEGORY_ID",
    "sortOrder": 1
  }'

# 2. CONSULTAR CATEGORÍAS
# Listar todas las categorías (plano)
curl -X GET "http://localhost:3000/categories?page=1&limit=20"

# Obtener árbol completo de categorías
curl -X GET http://localhost:3000/categories/tree

# Obtener categoría por ID (con hijos)
curl -X GET http://localhost:3000/categories/CATEGORY_ID

# Obtener categoría por slug
curl -X GET http://localhost:3000/categories/slug/electronics

# 3. ACTUALIZAR CATEGORÍAS
# Actualizar categoría (solo admin)
curl -X PUT http://localhost:3000/categories/CATEGORY_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Consumer Electronics",
    "description": "Updated description",
    "sortOrder": 5
  }'

# Activar categoría
curl -X PATCH http://localhost:3000/categories/CATEGORY_ID/activate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Desactivar categoría
curl -X PATCH http://localhost:3000/categories/CATEGORY_ID/deactivate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 4. ELIMINAR CATEGORÍAS
# Eliminar categoría (soft delete, solo admin)
curl -X DELETE http://localhost:3000/categories/CATEGORY_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Notas importantes para testing:**

- Reemplazar `YOUR_JWT_TOKEN` con token de admin válido
- Reemplazar `CATEGORY_ID` y `PARENT_CATEGORY_ID` con IDs reales
- Verificar que no se permita crear ciclos en jerarquía
- Probar que slugs se generen automáticamente si no se proveen
- Verificar que eliminación falle si categoría tiene productos
- Confirmar que estructura de árbol se retorne correctamente
- Validar que sortOrder afecte el ordenamiento en respuestas

#### Tarea 8: Sistema de Inventario

**Prompt para GitHub Copilot:**

```
Como experto en NestJS y gestión de inventario, implementa un sistema robusto:

1. Crear InventoryModule con:
   - InventoryService con lógica de reservas
   - InventoryController para consultas
   - Usar InventoryEntity ya definida

2. Implementar funcionalidades críticas:
   - checkAvailability(productId, quantity): verificar stock disponible
   - reserveStock(productId, quantity): reservar inventario temporalmente
   - releaseReservation(productId, quantity): liberar reserva
   - confirmReservation(productId, quantity): confirmar y reducir stock
   - replenishStock(productId, quantity): añadir stock

3. Características importantes:
   - Transacciones atómicas para operaciones de stock
   - Manejo de stock disponible vs reservado
   - Prevenir overselling con locks optimistas
   - TTL para reservas temporales (auto-release después de N minutos)
   - Logs detallados de movimientos de inventario

4. Crear DTOs:
   - CheckStockDto (productId, quantity)
   - ReserveStockDto (productId, quantity, reservationId)
   - StockMovementDto para tracking

5. Endpoints para consulta:
   - GET /inventory/:productId (stock actual y reservado)
   - GET /inventory (listado con filtros)

6. Implementar event sourcing básico para auditoria de movimientos

Este sistema debe ser thread-safe y manejar alta concurrencia sin race conditions.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios con mocks de transacciones
- Probar concurrencia con tests de stress
- Validar que reservas temporales expiren correctamente
- Verificar que no haya race conditions en operaciones de stock
- Confirmar que event sourcing capture todos los movimientos
- Validar que transacciones atómicas funcionen correctamente

### FASE 4: Sistema de Colas y Eventos

#### Tarea 9: Configuración de Redis y Bull Queue

**Prompt para GitHub Copilot:**

```
Como experto en NestJS y Bull queues, configura un sistema robusto de colas:

1. Configurar conexión a Redis:
   - Setup de RedisModule con configuración por ambiente
   - Pool de conexiones optimizado
   - Configuración de TTL y políticas de memoria
   - Health checks para Redis

2. Configurar Bull queues:
   - QueueModule centralizado
   - Múltiples queues especializadas:
     * order-processing (procesamiento de órdenes)
     * payment-processing (pagos)
     * inventory-management (inventario)
     * notification-sending (notificaciones)
   - Configuración de retry policies y backoff
   - Dead letter queue para jobs fallidos
   - Rate limiting por queue

3. Crear estructura base:
   - Job interfaces tipadas
   - Base processor class con logging y error handling
   - Queue metrics y monitoring
   - Dashboard UI para monitoreo (Bull Board)

4. Implementar características avanzadas:
   - Job priorities y delays
   - Job progress tracking
   - Job deduplication para idempotencia
   - Graceful shutdown handling

5. Configurar ambientes:
   - Desarrollo: single Redis instance
   - Producción: Redis cluster-ready

El sistema debe ser escalable y soportar miles de jobs concurrentes.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests de conexión a Redis
- Validar que múltiples queues funcionen correctamente
- Probar retry policies con jobs fallidos
- Verificar que Bull Board dashboard funcione
- Confirmar que rate limiting funcione adecuadamente
- Validar que graceful shutdown maneje jobs en progreso

#### Tarea 10: Sistema de Eventos y Outbox Pattern

**Prompt para GitHub Copilot:**

```
Como experto en Event-Driven Architecture, implementa el patrón Outbox:

1. Crear EventsModule con:
   - EventPublisher service para publicar eventos
   - OutboxProcessor para procesar eventos pendientes
   - Event handlers base class
   - Event store usando OutboxEventEntity

2. Implementar Outbox Pattern:
   - Método publishEvent() que guarda en DB transacionalmente
   - Background processor que lee eventos no procesados
   - Garantía de at-least-once delivery
   - Deduplicación en consumers
   - Retry exponencial para eventos fallidos

3. Definir eventos de dominio:
   - OrderCreatedEvent (orderId, userId, items, totalAmount)
   - OrderConfirmedEvent (orderId, paymentId)
   - OrderFailedEvent (orderId, reason)
   - InventoryReservedEvent (productId, quantity, reservationId)
   - PaymentProcessedEvent (orderId, paymentId, status)

4. Crear event handlers:
   - OrderCreatedHandler: inicia saga de procesamiento
   - Handlers para cada evento del flujo
   - Error handling y compensación

5. Implementar características:
   - Event versioning para evolución
   - Event replay capability
   - Monitoring de event processing lag
   - Dead letter queue para eventos problemáticos

6. Integrar con Bull queues para procesamiento asíncrono

El sistema debe garantizar consistencia eventual y ser resiliente a fallos.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios de event handlers
- Validar que Outbox Pattern funcione transacionalmente
- Probar que eventos no procesados se reintenten
- Verificar que deduplicación funcione correctamente
- Confirmar que event versioning sea compatible
- Validar que dead letter queue capture eventos problemáticos

### FASE 5: Procesamiento de Órdenes Asíncrono

#### Tarea 11: Módulo de Órdenes Base

**Prompt para GitHub Copilot:**

```
Como experto en NestJS y e-commerce, implementa el módulo core de órdenes:

1. Crear OrdersModule con:
   - OrdersController con endpoint principal POST /orders
   - OrdersService con lógica de creación
   - Usar OrderEntity y OrderItemEntity ya definidas

2. Implementar endpoint POST /orders:
   - Recibir CreateOrderDto (items array con productId y quantity)
   - Validar estructura de la orden
   - Calcular totales automáticamente
   - Generar idempotency key único
   - Crear orden con estado PENDING
   - Publicar OrderCreatedEvent via Outbox
   - Retornar 202 Accepted con order ID inmediatamente

3. DTOs necesarios:
   - CreateOrderDto con validaciones robustas
   - OrderItemDto (productId, quantity)
   - OrderResponseDto (id, status, total, items)
   - Validaciones: quantities > 0, productos existen

4. Endpoints adicionales:
   - GET /orders (órdenes del usuario logueado)
   - GET /orders/:id (detalle de orden)
   - GET /orders/:id/status (solo el estado)

5. Implementar características:
   - Idempotencia usando idempotency key
   - Validación de productos existentes
   - Cálculo automático de precios y totales
   - Transacciones atómicas para creación
   - Logging detallado del proceso

6. Documentación Swagger completa con ejemplos

CRÍTICO: El endpoint POST debe ser no-bloqueante y responder inmediatamente.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios y de integración
- Validar que idempotencia funcione con mismo key
- Probar que endpoint POST responda en <200ms
- Verificar que cálculo de totales sea preciso
- Confirmar que validaciones de productos funcionen
- Validar que eventos se publiquen correctamente

#### Tarea 12: Saga de Procesamiento de Órdenes

**Prompt para GitHub Copilot:**

```
Como experto en Saga Pattern, implementa la orquestación de procesamiento de órdenes:

1. Crear OrderProcessingSaga:
   - Saga que maneja el flujo completo de una orden
   - Estados definidos: STARTED, STOCK_VERIFIED, STOCK_RESERVED, PAYMENT_PROCESSING, PAYMENT_COMPLETED, CONFIRMED
   - Persistir estado en SagaStateEntity para recovery

2. Implementar steps del saga:
   - Step 1: Verificar stock disponible (InventoryService)
   - Step 2: Reservar inventario por tiempo limitado
   - Step 3: Procesar pago (PaymentsService)
   - Step 4: Confirmar reserva de inventario
   - Step 5: Enviar confirmación (NotificationsService)
   - Step 6: Marcar orden como CONFIRMED

3. Implementar compensación (rollback):
   - Si falla pago: liberar reserva de inventario
   - Si falla stock: marcar orden como CANCELLED
   - Si falla notificación: reintentar pero no fallar orden
   - Logs detallados de compensaciones

4. Crear OrderProcessingProcessor (Bull):
   - Recibe OrderCreatedEvent
   - Inicia y maneja saga step by step
   - Manejo de timeouts y retry
   - Update estado de orden en cada step

5. Características avanzadas:
   - Timeout de 10 minutos para todo el proceso
   - Retry exponencial con jitter
   - Parallel processing donde sea posible
   - Circuit breaker para servicios externos
   - Métricas de performance por step

6. Testing exhaustivo de escenarios de fallo

El saga debe ser resiliente y manejar cualquier punto de fallo elegantemente.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests exhaustivos de escenarios de fallo
- Validar que compensación (rollback) funcione correctamente
- Probar timeouts y recovery de saga
- Verificar que estado se persista correctamente en DB
- Confirmar que circuit breaker funcione con servicios externos
- Validar que métricas de performance se capturen

#### Tarea 13: Sistema de Pagos Mock

**Prompt para GitHub Copilot:**

```
Como experto en sistemas de pago, implementa un servicio de pagos simulado:

1. Crear PaymentsModule con:
   - PaymentsService con interface PaymentProvider
   - MockPaymentProvider que simula diferentes escenarios
   - PaymentEntity para tracking (opcional)

2. Implementar PaymentsService:
   - processPayment(orderId, amount, currency, paymentMethod)
   - getPaymentStatus(paymentId)
   - refundPayment(paymentId, amount)
   - Generar payment IDs únicos

3. MockPaymentProvider scenarios:
   - 80% success rate para simular realismo
   - 15% temporary failures (retry exitoso)
   - 5% permanent failures
   - Delays aleatorios (100-2000ms) para simular latencia
   - Diferentes failure reasons: insufficient_funds, expired_card, etc.

4. Implementar características realistas:
   - Idempotencia: mismo paymentId para mismo request
   - Webhook simulation para async payment updates
   - Payment status tracking (pending, succeeded, failed)
   - Partial refunds support

5. Crear DTOs:
   - ProcessPaymentDto (orderId, amount, currency, paymentMethod)
   - PaymentResponseDto (paymentId, status, transactionId)
   - RefundDto (paymentId, amount, reason)

6. Features adicionales:
   - Rate limiting para simular restrictions reales
   - Fraud detection mock (rechaza montos > $1000)
   - Multiple payment methods (credit_card, debit_card, bank_transfer)
   - Currency conversion mock

El servicio debe comportarse como un gateway real con todos sus edge cases.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios con diferentes escenarios
- Validar que success/failure rates sean realistas
- Probar que idempotencia funcione correctamente
- Verificar que different payment methods funcionen
- Confirmar que fraud detection funcione para montos altos
- Validar que webhooks simulation funcione adecuadamente

### FASE 6: Notificaciones y Finalización

#### Tarea 14: Sistema de Notificaciones

**Prompt para GitHub Copilot:**

```
Como experto en sistemas de notificación, implementa un servicio completo:

1. Crear NotificationsModule con:
   - NotificationsService con multiple providers
   - EmailProvider y SMSProvider (mock implementations)
   - Template system para mensajes
   - Queue-based sending con Bull

2. Implementar NotificationsService:
   - sendOrderConfirmation(orderId, userId)
   - sendPaymentFailure(orderId, userId, reason)
   - sendShippingUpdate(orderId, trackingNumber)
   - sendWelcomeEmail(userId)
   - Template rendering con variables dinámicas

3. Email Provider (mock):
   - Simular envío con delays realistas
   - 95% success rate
   - Template HTML básico para confirmación de orden
   - Support para attachments (PDF receipt)
   - Bounce/unsubscribe simulation

4. SMS Provider (mock):
   - Simular envío para updates críticos
   - Validación de números de teléfono
   - Rate limiting por usuario
   - Opt-out mechanism

5. Template System:
   - HTML templates para emails
   - Variable substitution {{orderNumber}}, {{customerName}}
   - Multi-language support básico (EN/ES)
   - Template versioning

6. Features avanzadas:
   - Notification preferences por usuario
   - Delivery status tracking
   - Retry with exponential backoff
   - Dead letter queue para fallos permanentes
   - Metrics: delivery rates, open rates, etc.

7. Queue Integration:
   - notification-sending queue
   - Batch processing para efficiency
   - Priority queuing (critical vs marketing)

El sistema debe ser extensible para agregar más providers (Push, Slack, etc).
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios de templates y providers
- Validar que templates HTML se rendericen correctamente
- Probar que variables dinámicas se sustituyan
- Verificar que rate limiting por usuario funcione
- Confirmar que notification preferences se respeten
- Validar que delivery status tracking funcione

#### Tarea 15: Health Checks y Monitoring

**Prompt para GitHub Copilot:**

```
Como experto en observabilidad, implementa un sistema completo de health checks:

1. Crear HealthModule usando @nestjs/terminus:
   - HealthController con múltiples endpoints
   - Custom health indicators para cada dependencia
   - Readiness vs Liveness probes

2. Health Indicators:
   - DatabaseHealthIndicator: conexión a PostgreSQL
   - RedisHealthIndicator: conexión y latencia de Redis
   - QueueHealthIndicator: estado de Bull queues
   - ExternalServiceIndicator: mock para payment gateway
   - DiskHealthIndicator: espacio en disco
   - MemoryHealthIndicator: uso de memoria

3. Endpoints implementar:
   - GET /health: health check general (liveness)
   - GET /health/ready: readiness check (dependencies)
   - GET /health/live: liveness check (app running)
   - GET /health/detailed: información detallada de todos los componentes

4. Métricas y Monitoring:
   - Prometheus metrics endpoint (/metrics)
   - Custom metrics para business logic:
     * Órdenes procesadas por minuto
     * Tiempo promedio de procesamiento
     * Queue lengths y processing times
     * Error rates por endpoint

5. Logging estructurado para observabilidad:
   - Correlation IDs para tracing
   - Request/response logging
   - Performance metrics logging
   - Error tracking con contexto completo

6. Alerting setup (configuración):
   - Umbrales para diferentes métricas
   - Escalation policies
   - Integration con herramientas externas
   - Status page configuration

7. Features avanzadas:
   - Circuit breaker status monitoring
   - Queue health con thresholds
   - Database connection pool monitoring
   - Memory leak detection
   - Response time percentiles (P95, P99)

El sistema debe proporcionar visibilidad completa del estado de la aplicación en tiempo real.
```

**Validaciones de Calidad:**

- Ejecutar `npm run lint` para validar código
- Verificar `npm run type-check` para tipos TypeScript
- Correr tests unitarios de health indicators
- Validar que endpoints de health respondan correctamente
- Probar que indicators detecten fallos reales
- Verificar que métricas de Prometheus se generen
- Confirmar que correlation IDs se propaguen
- Validar que alerting configuration sea funcional

#### Tarea 16: Estandarización de Tests Unitarios

**Objetivo:** Estandarizar y mejorar la calidad de los tests unitarios existentes siguiendo mejores prácticas y estándares de Jest/NestJS.

**Prompt para GitHub Copilot:**

```
Como experto en testing con Jest y NestJS, realiza una estandarización completa de los tests unitarios:

1. Aplicar correcciones de PR feedback:
   - Eliminar uso incorrecto de ValidationPipe en tests
   - Mockear correctamente funciones asíncronas (delay, setTimeout)
   - Mockear Math.random() para tests determinísticos
   - Corregir configuraciones de módulos de testing

2. Estandarizar estructura de tests:
   - Seguir patrón AAA (Arrange-Act-Assert)
   - Usar describe/it de forma consistente
   - Grupos lógicos con describe anidados
   - beforeEach/afterEach para setup/cleanup

3. Mejorar coverage de tests:
   - Asegurar >80% coverage en todas las áreas
   - Tests de casos edge (happy path + error cases)
   - Tests de validación de DTOs
   - Tests de guards y interceptors

4. Mocking consistente:
   - Usar jest.spyOn() para dependencias
   - MockRepository pattern para TypeORM
   - MockQueue pattern para Bull
   - Evitar implementaciones reales en unit tests

5. Aserciones claras y específicas:
   - expect() específicos (toEqual, toHaveBeenCalledWith)
   - Evitar expect(true).toBe(true) genéricos
   - Validar estructura completa de respuestas
   - Verificar todos los llamados a mocks

6. Documentación de tests:
   - Descripciones claras en it()
   - Comentarios para lógica compleja
   - Ejemplos de datos de test significativos
   - Explicar por qué se mockea cada cosa

7. Compatibilidad Node.js:
   - Polyfills necesarios (crypto para Node 18+)
   - Configuración correcta de environment
   - Timeouts apropiados para tests async

**IMPORTANTE**: Esta tarea se enfoca ÚNICAMENTE en tests unitarios. 
Los tests E2E serán implementados en una tarea futura (Tarea 17) con 
infraestructura dedicada y herramientas apropiadas.
```

**Archivos a Estandarizar:**

- `src/**/*.spec.ts` - Todos los tests unitarios
- `src/queues/processors/*.spec.ts` - Tests de processors
- `src/modules/*/*.spec.ts` - Tests de servicios y controllers
- `test/config/setup-after-env.ts` - Configuración global de tests

**Validaciones de Calidad:**

- ✅ Ejecutar `npm run lint` sin errores
- ✅ Verificar `npm run type-check` sin errores
- ✅ Correr `npm run test` con 954+ tests passing
- ✅ Validar coverage >80% con `npm run test:cov`
- ✅ Verificar que CI pipeline pase completamente
- ✅ No tests flakey (ejecutar 3 veces sin fallos)
- ✅ Tiempos de ejecución <30 segundos para unit tests
- ✅ Mocks correctamente configurados sin implementaciones reales

**Resultado Esperado:**

- 954+ tests unitarios passing
- Coverage >80% en todas las áreas
- Tests determinísticos (0% flakiness)
- CI pipeline verde
- Código de tests limpio y mantenible
- Documentación clara en cada test suite

---

## 6. Consideraciones de Implementación

### Orden de Desarrollo Recomendado

1. **FASE 1**: Establecer base sólida con repo, CI/CD y configuración
2. **FASE 2**: Implementar autenticación y gestión de usuarios
3. **FASE 3**: Desarrollar catálogo de productos e inventario
4. **FASE 4**: Configurar sistema de eventos y colas asíncronas
5. **FASE 5**: Implementar procesamiento de órdenes con Saga Pattern
6. **FASE 6**: Completar con notificaciones y monitoring

### Criterios de Calidad Transversales

Para **TODAS** las tareas, se debe verificar:

- ✅ **Linting**: `npm run lint` sin errores
- ✅ **Type Safety**: `npm run type-check` sin errores
- ✅ **Testing**: Coverage mínimo 80%
- ✅ **Format**: `npm run format` aplicado
- ✅ **Build**: `npm run build` exitoso
- ✅ **Security**: `npm audit` sin vulnerabilidades críticas
- ✅ **Documentation**: Swagger/OpenAPI completa

### Definición de "Done"

Una tarea se considera completada cuando:

1. **Funcionalidad**: Cumple todos los requisitos especificados
2. **Calidad**: Pasa todas las validaciones de calidad
3. **Testing**: Tests unitarios y de integración implementados
4. **Documentation**: Documentación técnica y de API actualizada
5. **CI/CD**: Pipeline pasa sin errores
6. **Code Review**: Aprobado por al menos un reviewer
7. **Deploy**: Deployado exitosamente en ambiente de staging

```

```
