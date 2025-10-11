# ADR-006: PostgreSQL Database Choice

**Status**: Aceptado  
**Fecha**: 2025-10-09  
**Contexto**: Tecnologías y Stack  
**Relacionado con**: ADR-005 (NestJS), ADR-007 (TypeORM), ADR-002 (Outbox Pattern)

---

## 📋 Contexto y Problema

Al diseñar un sistema e-commerce con patrones avanzados (Event Sourcing, Outbox, Saga), necesitamos una base de datos que soporte:

1. **ACID Transactions** (para consistency en Outbox Pattern)
2. **JSONB Storage** (para event payloads, metadata flexible)
3. **Advanced Indexing** (para queries complejas y performance)
4. **Enums Nativos** (para type safety en estados)
5. **UUID Support** (para IDs distribuidos)
6. **Full-Text Search** (para búsqueda de productos)
7. **Concurrency Control** (para race conditions en inventario)

### Problema Principal

**¿Qué base de datos nos provee las características enterprise necesarias para un sistema event-driven con alta consistencia sin sacrificar performance?**

### Contexto del Proyecto

```yaml
Requirements:
  - Outbox Pattern: Atomic writes (Event + Entity)
  - Saga Pattern: State tracking con JSONB
  - Inventory: Pessimistic locking
  - Products: Full-text search
  - Orders: Complex queries con aggregations
  - Scalability: Connection pooling, read replicas
```

---

## 🎯 Decisión

**Adoptamos PostgreSQL 15+ como base de datos principal.**

### Justificación

PostgreSQL provee la **combinación perfecta** de features ACID + NoSQL flexibility + performance + extensibility.

```
┌────────────────────────────────────────────────────────────────┐
│                     PostgreSQL Database                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐  ┌─────────────────────────────┐   │
│  │   ACID Guarantees    │  │      JSONB Storage          │   │
│  │                      │  │                             │   │
│  │  • Transactions      │  │  • Event payloads           │   │
│  │  • Atomicity         │  │  • Product attributes       │   │
│  │  • Consistency       │  │  • Addresses (shipping/billing) │
│  │  • Isolation         │  │  • Saga state data          │   │
│  │  • Durability        │  │  • Outbox metadata          │   │
│  └──────────────────────┘  └─────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────┐  ┌─────────────────────────────┐   │
│  │   Advanced Indexes   │  │     Enums & UUIDs           │   │
│  │                      │  │                             │   │
│  │  • B-tree (default)  │  │  • order_status_enum        │   │
│  │  • GIN (JSONB, arrays)│  │  • saga_status_enum        │   │
│  │  • Full-text search  │  │  • inventory_movement_enum  │   │
│  │  • Partial indexes   │  │  • uuid-ossp extension      │   │
│  │  • Composite indexes │  │  • uuid_generate_v4()       │   │
│  └──────────────────────┘  └─────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │            Concurrency & Locking                         │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │  • Pessimistic Locking (SELECT FOR UPDATE)              │ │
│  │  • Optimistic Locking (version columns)                 │ │
│  │  • Row-level locking (multi-user safety)                │ │
│  │  • MVCC (Multi-Version Concurrency Control)             │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implementación Real

### 1. **Configuration**

#### Database Config (database.config.ts)

```typescript
// src/config/database.config.ts
export const databaseConfig = registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres', // ✅ PostgreSQL chosen
    host: process.env['DATABASE_HOST'] || 'localhost',
    port: parseInt(process.env['DATABASE_PORT'] || '5433', 10),
    username: process.env['DATABASE_USERNAME'] || 'postgres',
    password: process.env['DATABASE_PASSWORD'] || 'password',
    database: process.env['DATABASE_NAME'] || 'ecommerce_async_dev',

    // Entity and Migration Paths
    entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],

    // Migration Configuration
    synchronize: false, // ✅ Use migrations for safety
    migrationsRun: process.env['RUN_MIGRATIONS'] === 'true',
    migrationsTableName: 'migrations_history',

    // Logging Configuration
    logging: process.env['NODE_ENV'] === 'development' ? 'all' : ['error', 'warn'],
    logger: 'advanced-console',
    maxQueryExecutionTime: 10000, // Log slow queries (>10s)

    // Connection Pool Configuration
    extra: {
      max: parseInt(process.env['DATABASE_MAX_CONNECTIONS'] || '20', 10),
      min: parseInt(process.env['DATABASE_MIN_CONNECTIONS'] || '5', 10),
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,

      // Connection validation
      testOnBorrow: true,
      validationQuery: 'SELECT 1', // PostgreSQL health check
    },

    // SSL Configuration (production)
    ssl:
      process.env['DATABASE_SSL'] === 'true'
        ? {
            rejectUnauthorized: false,
            ca: process.env['DATABASE_SSL_CA'],
          }
        : false,

    // Retry and Error Handling
    retryAttempts: parseInt(process.env['DATABASE_RETRY_ATTEMPTS'] || '3', 10),
    retryDelay: parseInt(process.env['DATABASE_RETRY_DELAY'] || '3000', 10),
  }),
);
```

**Features Configuradas**:

- ✅ **Connection Pooling**: 5-20 connections
- ✅ **Health Checks**: `SELECT 1` validation
- ✅ **Slow Query Logging**: >10s queries logged
- ✅ **SSL Support**: Para production
- ✅ **Retry Logic**: 3 attempts con 3s delay

---

### 2. **UUID Extension**

#### Migration: Enable UUID

```typescript
// src/database/migrations/1727215000000-CreateInitialSchema.ts
public async up(queryRunner: QueryRunner): Promise<void> {
  // Enable UUID extension
  await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Now we can use uuid_generate_v4()
}
```

**Usage in Entities**:

```typescript
// All entities use UUID primary keys
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid') // ✅ UUID v4
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;
}
```

**Benefits**:

- ✅ **Distributed IDs**: No need for central sequence generator
- ✅ **Collision-free**: Virtually impossible UUID collision
- ✅ **Scalability**: Ready for distributed systems
- ✅ **Security**: No sequential ID enumeration attacks

---

### 3. **Native Enums**

#### Migration: Create Enums

```typescript
// src/database/migrations/1727215000000-CreateInitialSchema.ts
public async up(queryRunner: QueryRunner): Promise<void> {
  // Create order status enum
  await queryRunner.query(`
    CREATE TYPE "order_status_enum" AS ENUM (
      'PENDING', 'PROCESSING', 'PAYMENT_PENDING', 'PAYMENT_FAILED',
      'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'
    )
  `);

  // Create saga status enum
  await queryRunner.query(`
    CREATE TYPE "saga_status_enum" AS ENUM (
      'STARTED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING',
      'COMPENSATING', 'COMPENSATED', 'COMPENSATION_FAILED',
      'CANCELLED', 'TIMEOUT'
    )
  `);

  // Create inventory movement type enum
  await queryRunner.query(`
    CREATE TYPE "inventory_movement_type_enum" AS ENUM (
      'RESTOCK', 'SALE', 'RETURN', 'ADJUSTMENT', 'RESERVATION',
      'RELEASE_RESERVATION', 'DAMAGE', 'THEFT', 'TRANSFER_IN',
      'TRANSFER_OUT', 'EXPIRED', 'QUALITY_CONTROL',
      'MANUAL_CORRECTION', 'SYSTEM_CORRECTION'
    )
  `);
}
```

**Usage in Entities**:

```typescript
// TypeScript enum
export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  // ... rest
}

// Entity column
@Entity('orders')
export class Order {
  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;
}
```

**Benefits**:

- ✅ **Type Safety**: Database-level validation
- ✅ **Storage Efficient**: Stored as integers internally
- ✅ **Auto-Complete**: IDE knows valid values
- ✅ **Schema Documentation**: Self-documenting

---

### 4. **JSONB for Flexible Data**

#### Use Case 1: Event Payloads (Outbox Pattern)

```typescript
// src/modules/events/entities/outbox-event.entity.ts
@Entity('outbox_events')
export class OutboxEvent {
  @Column({
    type: 'jsonb',
    nullable: false,
    name: 'event_data',
    comment: 'Event payload as JSON',
  })
  eventData!: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    nullable: true,
    name: 'event_metadata',
    comment: 'Additional metadata for the event',
  })
  eventMetadata?: Record<string, unknown>;
}
```

**Example Data**:

```json
{
  "eventData": {
    "orderId": "uuid-123",
    "userId": "uuid-456",
    "totalAmount": 199.99,
    "items": [{ "productId": "uuid-789", "quantity": 2, "price": 99.99 }]
  },
  "eventMetadata": {
    "source": "orders-service",
    "version": "1.0",
    "timestamp": "2025-10-09T12:00:00Z"
  }
}
```

#### Use Case 2: Saga State Data

```typescript
// src/database/entities/saga-state.entity.ts
@Entity('saga_states')
export class SagaStateEntity {
  @Column({
    name: 'saga_data',
    type: 'jsonb',
    nullable: false,
  })
  stateData: Record<string, unknown>;
}
```

**Example Data**:

```json
{
  "orderId": "uuid-123",
  "steps": {
    "reserveInventory": { "status": "completed", "timestamp": "..." },
    "processPayment": { "status": "running", "timestamp": "..." },
    "sendNotification": { "status": "pending" }
  },
  "compensations": []
}
```

#### Use Case 3: Order Addresses

```typescript
// src/modules/orders/entities/order.entity.ts
@Entity('orders')
export class Order {
  @Column({
    type: 'jsonb',
    nullable: true,
    name: 'shipping_address',
    comment: 'Shipping address as JSON',
  })
  shippingAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    name?: string;
    phone?: string;
  };

  @Column({
    type: 'jsonb',
    nullable: true,
    name: 'billing_address',
    comment: 'Billing address as JSON',
  })
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    name?: string;
    phone?: string;
  };
}
```

#### Use Case 4: Product Attributes

```typescript
// src/modules/products/entities/product.entity.ts
@Entity('products')
export class Product {
  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Additional product attributes and metadata',
  })
  attributes?: Record<string, unknown>;
}
```

**Example Data**:

```json
{
  "color": "Blue",
  "size": "L",
  "material": "Cotton",
  "features": ["water-resistant", "breathable"],
  "certifications": ["ISO 9001", "OEKO-TEX"]
}
```

**JSONB Benefits**:

- ✅ **Schema Flexibility**: Add fields without migrations
- ✅ **Indexable**: GIN indexes for fast queries
- ✅ **Type Safety**: Validate with JSON Schema
- ✅ **Queryable**: `WHERE attributes->>'color' = 'Blue'`

---

### 5. **Advanced Indexing**

#### Index Strategy (Migration)

```typescript
// src/database/migrations/1727215000000-CreateInitialSchema.ts

// ============ ORDERS ============
// B-tree indexes (default)
await queryRunner.query('CREATE INDEX "idx_orders_user_id" ON "orders" ("user_id")');
await queryRunner.query('CREATE INDEX "idx_orders_status" ON "orders" ("status")');
await queryRunner.query('CREATE INDEX "idx_orders_created_at" ON "orders" ("created_at")');

// Unique partial index (only non-null idempotency keys)
await queryRunner.query(`
  CREATE UNIQUE INDEX "idx_orders_idempotency_key" 
  ON "orders" ("idempotency_key") 
  WHERE "idempotency_key" IS NOT NULL
`);

// Conditional index (only non-null payment IDs)
await queryRunner.query(`
  CREATE INDEX "idx_orders_payment_id" 
  ON "orders" ("payment_id") 
  WHERE "payment_id" IS NOT NULL
`);

// ============ PRODUCTS ============
// Full-text search index (GIN)
await queryRunner.query(`
  CREATE INDEX "idx_products_name_description" 
  ON "products" 
  USING GIN (to_tsvector('english', "name" || ' ' || COALESCE("description", '')))
`);

// Unique constraint on SKU
await queryRunner.query('CREATE UNIQUE INDEX "idx_products_sku" ON "products" ("sku")');

// Price index for range queries
await queryRunner.query('CREATE INDEX "idx_products_price" ON "products" ("price")');

// ============ INVENTORY ============
// Composite index for low stock alerts
await queryRunner.query(`
  CREATE INDEX "idx_inventory_low_stock" 
  ON "inventory" ("current_stock", "minimum_stock")
`);

// Unique constraint on product + location
await queryRunner.query(`
  CREATE UNIQUE INDEX "idx_inventory_product_location" 
  ON "inventory" ("product_id", "location")
`);

// ============ OUTBOX EVENTS ============
// Index for unprocessed events (critical for publisher)
await queryRunner.query(`
  CREATE INDEX "idx_outbox_events_processed" 
  ON "outbox_events" ("processed")
`);

// Index for event type filtering
await queryRunner.query(`
  CREATE INDEX "idx_outbox_events_event_type" 
  ON "outbox_events" ("event_type")
`);

// Sequence number for ordering
await queryRunner.query(`
  CREATE INDEX "idx_outbox_events_sequence" 
  ON "outbox_events" ("sequence_number")
`);

// Correlation ID for tracing (conditional)
await queryRunner.query(`
  CREATE INDEX "idx_outbox_events_correlation_id" 
  ON "outbox_events" ("correlation_id") 
  WHERE "correlation_id" IS NOT NULL
`);

// ============ SAGA STATES ============
// Index for active sagas
await queryRunner.query(`
  CREATE INDEX "idx_saga_states_status" 
  ON "saga_states" ("status")
`);

// Next step scheduling (conditional)
await queryRunner.query(`
  CREATE INDEX "idx_saga_states_next_step_at" 
  ON "saga_states" ("next_step_at") 
  WHERE "next_step_at" IS NOT NULL
`);
```

**Index Types Used**:

| Type                 | Purpose                            | Example                             |
| -------------------- | ---------------------------------- | ----------------------------------- |
| **B-tree** (default) | Equality, range queries            | `idx_orders_user_id`                |
| **GIN**              | Full-text search, JSONB            | `idx_products_name_description`     |
| **Partial**          | Index only rows matching condition | `WHERE idempotency_key IS NOT NULL` |
| **Unique**           | Enforce uniqueness                 | `idx_products_sku`                  |
| **Composite**        | Multi-column queries               | `(current_stock, minimum_stock)`    |

---

### 6. **Full-Text Search**

#### Implementation

```typescript
// Migration
await queryRunner.query(`
  CREATE INDEX "idx_products_name_description" 
  ON "products" 
  USING GIN (to_tsvector('english', "name" || ' ' || COALESCE("description", '')))
`);

// Usage in queries
const products = await productRepository
  .createQueryBuilder('product')
  .where(
    `to_tsvector('english', product.name || ' ' || COALESCE(product.description, '')) @@ plainto_tsquery('english', :query)`,
    {
      query: 'wireless headphones',
    },
  )
  .getMany();
```

**Benefits**:

- ✅ **Language Support**: 'english', 'spanish', etc.
- ✅ **Stemming**: 'run' matches 'running', 'runs', 'ran'
- ✅ **Stop Words**: Ignores 'the', 'and', 'or'
- ✅ **Ranking**: `ts_rank()` for relevance scoring

---

### 7. **Concurrency Control**

#### Pessimistic Locking (Inventory)

```typescript
// src/modules/inventory/inventory.service.ts
async reserveStock(productId: string, quantity: number): Promise<void> {
  return this.dataSource.transaction(async (manager) => {
    // ✅ PostgreSQL SELECT FOR UPDATE (pessimistic write lock)
    const inventory = await manager.findOne(Inventory, {
      where: { productId },
      lock: { mode: 'pessimistic_write' },  // Row-level lock
    });

    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }

    if (inventory.currentStock < quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    // Safe update (row locked, no race condition)
    inventory.reservedStock += quantity;
    await manager.save(inventory);
  });
}
```

**How It Works**:

1. **Transaction starts**
2. **SELECT FOR UPDATE**: Row locked (other transactions wait)
3. **Check stock**: Safe read (no concurrent modifications)
4. **Update reserved**: Atomic operation
5. **COMMIT**: Lock released

**Benefits**:

- ✅ **No Race Conditions**: Prevents double-reservations
- ✅ **ACID**: Atomic with order creation
- ✅ **Deadlock Detection**: PostgreSQL handles automatically

#### Optimistic Locking (Alternative)

```typescript
@Entity('products')
export class Product {
  @VersionColumn()
  version: number; // Auto-incremented on each update
}

// Update fails if version changed (optimistic lock)
await productRepository.update(
  { id: productId, version: currentVersion },
  { price: newPrice, version: () => 'version + 1' },
);
```

---

### 8. **ACID Transactions (Outbox Pattern)**

#### Atomic Event Publishing

```typescript
// src/modules/orders/orders.service.ts
async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Save order
    const order = queryRunner.manager.save(Order, orderData);

    // 2. Save order items
    await queryRunner.manager.save(OrderItem, orderItems);

    // 3. Publish event to Outbox (SAME transaction!)
    await this.eventPublisher.publishOrderCreated(order, queryRunner);

    // ✅ COMMIT: Order + Outbox Event committed atomically
    await queryRunner.commitTransaction();

    return this.mapToResponseDto(order);
  } catch (error) {
    // ❌ ROLLBACK: Nothing persisted
    await queryRunner.rollback Transaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

**Why This Matters**:

- ✅ **No Lost Events**: Event always persisted with entity
- ✅ **No Orphan Events**: Entity creation fails → No event
- ✅ **At-Least-Once Delivery**: Event published eventually (Outbox Processor)

---

### 9. **Arrays for Multi-Value Columns**

#### Use Case: Product Images & Tags

```typescript
// src/modules/products/entities/product.entity.ts
@Entity('products')
export class Product {
  @Column({
    type: 'varchar',
    array: true,
    nullable: true,
    comment: 'Array of image URLs',
  })
  images?: string[];

  @Column({
    type: 'varchar',
    array: true,
    nullable: true,
    comment: 'Search tags for the product',
  })
  tags?: string[];
}
```

**Query Examples**:

```typescript
// Find products with specific tag
const products = await productRepository.find({
  where: {
    tags: ArrayContains(['wireless']),
  },
});

// Find products with any of multiple tags
const products = await productRepository
  .createQueryBuilder('product')
  .where(':tag = ANY(product.tags)', { tag: 'bluetooth' })
  .getMany();
```

**Benefits**:

- ✅ **No Join Table**: Simpler schema
- ✅ **GIN Indexable**: Fast array queries
- ✅ **Type Safe**: TypeScript arrays

---

## 📊 Evidencias de la Implementación

### Database Schema

```
Total Tables: 9
├── users                  (UUID, indexes, constraints)
├── products               (UUID, JSONB attributes, full-text search, soft-delete)
├── categories             (UUID, tree structure)
├── orders                 (UUID, ENUMs, JSONB addresses, idempotency)
├── order_items            (UUID, composite unique constraint)
├── inventory              (UUID, pessimistic locking, composite unique)
├── inventory_movements    (UUID, audit trail)
├── outbox_events          (UUID, JSONB payloads, sequence, idempotency)
└── saga_states            (UUID, ENUMs, JSONB state data)

Total Indexes: 60+
├── B-tree: 45 (users, orders, products, inventory)
├── GIN: 2 (full-text search, JSONB)
├── Unique: 10 (idempotency, SKU, email)
├── Partial: 5 (conditional indexes)
└── Composite: 3 (low stock, order+product)

Total Enums: 3
├── order_status_enum (9 values)
├── saga_status_enum (10 values)
└── inventory_movement_type_enum (14 values)
```

### Metrics

| Métrica                | Valor | Observación                         |
| ---------------------- | ----- | ----------------------------------- |
| **Total Entidades**    | 11    | Modularizado por feature            |
| **JSONB Columns**      | 7     | Events, Saga, Addresses, Attributes |
| **UUID Columns**       | 40+   | Primary + Foreign keys              |
| **Enum Columns**       | 4     | Type-safe estados                   |
| **Array Columns**      | 6     | Images, Tags, Steps                 |
| **Indexes**            | 60+   | Optimized queries                   |
| **Foreign Keys**       | 8     | Referential integrity               |
| **Unique Constraints** | 10    | Business rules                      |

---

## ⚖️ Alternativas Consideradas

### Opción 1: MySQL (Rechazada)

**Descripción**: Database relacional popular

**Razones de Rechazo**:

- ❌ **JSONB**: MySQL JSON performance inferior (no indexes eficientes)
- ❌ **Full-Text Search**: Menos potente que PostgreSQL
- ❌ **Enums**: No enums nativos (VARCHAR con CHECK constraint)
- ❌ **Arrays**: No soporte nativo
- ❌ **MVCC**: Lock management menos sofisticado
- ⚠️ **Extensions**: Ecosystem más limitado

**Cuándo Usar MySQL**:

- Aplicaciones simples CRUD
- Stack existente (legacy)
- Replicación master-slave simple

---

### Opción 2: MongoDB (Rechazada)

**Descripción**: Document database (NoSQL)

**Razones de Rechazo**:

- ❌ **ACID Transactions**: Solo desde v4.0, menos maduro
- ❌ **Outbox Pattern**: Difícil garantizar atomicity cross-collection
- ❌ **Joins**: Lookups lentos, no optimized
- ❌ **Schema Enforcement**: Menos validación que PostgreSQL
- ❌ **TypeORM Support**: TypeORM optimizado para SQL
- ⚠️ **Learning Curve**: Query language diferente

**Cuándo Considerar MongoDB**:

- Datos altamente denormalizados
- Schema extremadamente flexible
- Write-heavy workloads (logs, analytics)
- Documentos grandes (>1MB)

---

### Opción 3: MariaDB (Rechazada)

**Descripción**: Fork de MySQL

**Razones de Rechazo**:

- ❌ **JSONB**: JSON storage menos eficiente que PostgreSQL
- ❌ **Extensions**: Menos extensible
- ⚠️ **Similar a MySQL**: Mismas limitaciones

---

### Opción 4: CockroachDB (Considerada para Futuro)

**Descripción**: PostgreSQL-compatible distributed database

**Razones de NO Adopción Inmediata**:

- ⚠️ **Complexity**: Overkill para single-region MVP
- ⚠️ **Cost**: Más caro que PostgreSQL managed
- ⚠️ **Learning Curve**: Team sin experiencia
- ⚠️ **Tooling**: Menos maduro ecosystem

**Cuándo Migrar a CockroachDB**:

- Multi-region deployment
- > 1M requests/day
- 99.99% uptime SLA
- Geo-replication requirements

---

## 📈 Ventajas de PostgreSQL

### 1. **ACID + NoSQL Flexibility**

```sql
-- Relational (ACID)
INSERT INTO orders (user_id, total_amount, status)
VALUES ('uuid-123', 199.99, 'PENDING');

-- NoSQL (JSONB)
UPDATE orders
SET shipping_address = '{"city": "Madrid", "country": "Spain"}'::jsonb
WHERE id = 'uuid-123';

-- ✅ Best of both worlds!
```

### 2. **Advanced Query Capabilities**

```sql
-- Full-text search
SELECT * FROM products
WHERE to_tsvector('english', name || ' ' || description)
      @@ plainto_tsquery('english', 'wireless headphones');

-- JSONB queries
SELECT * FROM orders
WHERE shipping_address->>'country' = 'Spain';

-- Array queries
SELECT * FROM products
WHERE 'bluetooth' = ANY(tags);

-- Window functions
SELECT
  product_id,
  quantity,
  SUM(quantity) OVER (PARTITION BY product_id ORDER BY created_at) as running_total
FROM inventory_movements;
```

### 3. **Enterprise Features**

- ✅ **Replication**: Streaming, logical, physical
- ✅ **Partitioning**: Range, list, hash
- ✅ **Extensions**: PostGIS, pg_trgm, hstore
- ✅ **Performance**: Query planner, EXPLAIN ANALYZE
- ✅ **Security**: RLS (Row-Level Security), SSL

### 4. **Ecosystem Maturity**

- ✅ **TypeORM**: First-class support
- ✅ **Managed Services**: AWS RDS, Google Cloud SQL, Azure
- ✅ **Monitoring**: pgAdmin, DataGrip, DBeaver
- ✅ **Migrations**: TypeORM, Flyway, Liquibase

---

## 🎓 Lecciones Aprendidas

### 1. JSONB vs Separate Tables

```typescript
// ✅ GOOD: JSONB for flexible data
@Column({ type: 'jsonb' })
attributes?: Record<string, unknown>;

// ❌ BAD: Separate table for every attribute
// CREATE TABLE product_attributes (product_id, key, value)
```

**Decision**: JSONB para datos sin relationships, tablas para relationships

### 2. Partial Indexes para Sparse Data

```sql
-- ✅ GOOD: Index only non-null values
CREATE UNIQUE INDEX idx_orders_idempotency_key
ON orders (idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- ❌ BAD: Index all rows (wasted space)
CREATE UNIQUE INDEX idx_orders_idempotency_key
ON orders (idempotency_key);
```

**Benefit**: 40% disk space saved en indexes

### 3. Enums vs VARCHAR

```sql
-- ✅ GOOD: Native enum
CREATE TYPE order_status_enum AS ENUM ('PENDING', 'PROCESSING', ...);

-- ❌ BAD: VARCHAR with check constraint
status VARCHAR(50) CHECK (status IN ('PENDING', 'PROCESSING', ...))
```

**Benefits**:

- Type safety en database
- Storage efficiency (4 bytes vs string length)
- Performance (integer comparisons)

### 4. Connection Pooling Crítico

```typescript
// ✅ GOOD: Pool configuration
extra: {
  max: 20,  // Max connections
  min: 5,   // Min connections
  testOnBorrow: true,
  validationQuery: 'SELECT 1',
}

// ❌ BAD: No pool limits (connection exhaustion)
```

---

## 🔄 Evolución Futura

### Fase Actual: Single PostgreSQL Instance

```
✅ Single primary database
✅ Connection pooling
✅ All features used (JSONB, Enums, Arrays, FTS)
✅ Migrations managed
```

### Fase 2: Read Replicas

```yaml
Architecture:
  Primary (Write):
    - Orders creation
    - Inventory updates
    - User authentication

  Replica 1 (Read):
    - Product catalog queries
    - Order history
    - Search

  Replica 2 (Read):
    - Analytics
    - Reporting
    - Dashboard queries

Load Balancing:
  - pg-pool II
  - AWS RDS Read Replicas
  - Automatic failover
```

### Fase 3: Partitioning

```sql
-- Partition orders by month (time-series data)
CREATE TABLE orders (
  id UUID,
  created_at TIMESTAMPTZ,
  ...
) PARTITION BY RANGE (created_at);

CREATE TABLE orders_2025_01 PARTITION OF orders
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE orders_2025_02 PARTITION OF orders
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Auto-prune old partitions
DROP TABLE orders_2023_01;
```

### Fase 4: Multi-Region (CockroachDB)

```
Region 1 (EU): Orders, Users (EU customers)
Region 2 (US): Orders, Users (US customers)
Region 3 (ASIA): Orders, Users (ASIA customers)

Replication: Multi-master, eventual consistency
Latency: <50ms local reads
```

---

## 📝 Conclusión

**Elegimos PostgreSQL** porque provee la **combinación perfecta** de ACID transactions, NoSQL flexibility, advanced features, y ecosystem maturity necesarios para un sistema event-driven enterprise.

**Decisión Final**: ✅ Aceptado

**Justificación**:

1. ✅ **ACID Transactions**: Outbox Pattern requires atomicity
2. ✅ **JSONB**: Event payloads, Saga state, flexible attributes
3. ✅ **Enums**: Type-safe status management
4. ✅ **UUID**: Distributed ID generation
5. ✅ **Full-Text Search**: Product catalog
6. ✅ **Advanced Indexes**: 60+ indexes for performance
7. ✅ **Concurrency**: Pessimistic locking for inventory
8. ✅ **Ecosystem**: TypeORM, NestJS, managed services

**Trade-offs Aceptados**:

- ⚠️ Vertical scaling primero (horizontal más complejo)
- ⚠️ Learning curve (más features = más complejidad)
- ⚠️ Managed service costs (AWS RDS más caro que self-hosted)

**Firmantes**:

- Arquitectura: ✅ Aprobado
- Backend Team: ✅ Implementado
- DBA: ✅ Optimizado

---

## 🔗 Referencias

### Documentación Interna

- [ADR-002: Outbox Pattern](002-event-driven-outbox-pattern.md)
- [ADR-007: TypeORM](007-typeorm-data-layer.md)
- [Database Design](../DATABASE_DESIGN.md)

### Código Fuente Clave

```
src/config/database.config.ts                # Database configuration
src/database/migrations/
  1727215000000-CreateInitialSchema.ts       # Main schema (9 tables, 60+ indexes)
  1727220000000-CreateCategoriesTable.ts     # Category table
  1727221000000-AddCategoryToProducts.ts     # FK addition

src/modules/orders/entities/order.entity.ts  # JSONB addresses, UUID, enums
src/modules/products/entities/product.entity.ts # JSONB attributes, arrays, FTS
src/modules/events/entities/outbox-event.entity.ts # JSONB payloads, sequence
src/database/entities/saga-state.entity.ts   # JSONB state data
```

### Recursos Externos

- PostgreSQL Docs: https://www.postgresql.org/docs/
- JSONB: https://www.postgresql.org/docs/current/datatype-json.html
- Full-Text Search: https://www.postgresql.org/docs/current/textsearch.html
- TypeORM PostgreSQL: https://typeorm.io/database-features

---

**Última Revisión**: 2025-10-09  
**Próxima Revisión**: Al considerar read replicas o partitioning
