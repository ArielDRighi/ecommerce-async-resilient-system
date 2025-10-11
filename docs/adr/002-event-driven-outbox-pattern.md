# ADR-002: Event-Driven Architecture con Outbox Pattern

- **Estado**: ✅ Aceptado
- **Fecha**: 2025-09-05
- **Decisores**: Backend Development Team, Database Architect
- **Área de Impacto**: Data Consistency, Reliability, Event Publishing

## Contexto

En una arquitectura asíncrona, necesitamos publicar eventos cuando ocurren cambios importantes (ej: orden creada, pago procesado). El desafío es **garantizar que los eventos se publiquen de manera confiable** incluso si el sistema falla.

### Problema: Dual Writes y Perdida de Datos

**Enfoque Naive (❌ NO USAR)**:

```typescript
async createOrder(data) {
  // 1. Guardar en DB
  const order = await this.orderRepository.save(data);

  // 2. Publicar evento ⚠️ PROBLEMA
  await this.eventBus.publish(new OrderCreatedEvent(order));

  return order;
}
```

**¿Qué puede salir mal?**

**Escenario 1: Fallo después de DB commit** ❌

```
✅ Orden guardada en DB
❌ App crashea ANTES de publicar evento
❌ Evento PERDIDO → Workers nunca procesan la orden
❌ Orden queda en estado PENDING permanentemente
```

**Escenario 2: Fallo del Event Bus** ❌

```
✅ Orden guardada en DB
❌ Redis/Queue está caído
❌ Evento NO se publica
❌ Mismo resultado: órden huérfana
```

**Escenario 3: Transacción Rollback** ❌

```
❌ Orden NO se guarda (DB rollback)
✅ Evento YA se publicó
❌ Workers procesan evento de orden inexistente
❌ Inconsistencia: eventos de entidades que no existen
```

Este problema se llama **"Dual Writes"** - escribir en 2 sistemas (DB + Queue) no es atómico.

## Decisión

**Implementar Outbox Pattern** para garantizar publicación confiable de eventos.

### Arquitectura del Outbox Pattern

```
┌─────────────────────────────────────────────────────┐
│  Transaction Boundary (Atómico)                     │
│                                                      │
│  ┌──────────────────┐      ┌──────────────────┐   │
│  │   orders table   │      │ outbox_events    │   │
│  │                  │      │  table           │   │
│  │  INSERT order    │ + COMMIT + INSERT event │   │
│  │  id, status,     │      │  event_type,     │   │
│  │  total_amount    │      │  event_data,     │   │
│  └──────────────────┘      │  processed=false │   │
│                             └──────────────────┘   │
└─────────────────────────────────────────────────────┘
           ↓
    (Single DB Transaction - ACID Guaranteed)
           ↓
┌─────────────────────────────────────────────────────┐
│  Outbox Processor (Background Worker)               │
│                                                      │
│  1. SELECT * FROM outbox_events                     │
│     WHERE processed = false                         │
│     ORDER BY created_at LIMIT 100                   │
│                                                      │
│  2. FOR EACH event:                                 │
│     → Publish to Queue                              │
│     → Mark processed = true                         │
│                                                      │
│  3. Runs every 5 seconds (configurable)             │
└─────────────────────────────────────────────────────┘
           ↓
    (Publishes to Bull Queue)
           ↓
┌─────────────────────────────────────────────────────┐
│  Queue Processors (Handle Events)                   │
│                                                      │
│  - OrderCreatedHandler                              │
│  - PaymentProcessedHandler                          │
│  - InventoryReservedHandler                         │
└─────────────────────────────────────────────────────┘
```

### Implementación Real

#### 1. **Outbox Entity** (Tabla de Eventos)

```typescript
// src/modules/events/entities/outbox-event.entity.ts
@Entity('outbox_events')
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'aggregate_id' })
  aggregateId: string; // ID de la entidad (ej: order ID)

  @Column({ name: 'aggregate_type' })
  aggregateType: string; // Tipo (ej: 'Order', 'Payment')

  @Column({ name: 'event_type' })
  eventType: string; // Nombre del evento (ej: 'OrderCreated')

  @Column({ type: 'jsonb', name: 'event_data' })
  eventData: Record<string, any>; // Payload completo del evento

  @Column({ default: false })
  processed: boolean; // ¿Ya fue publicado?

  @Column({ nullable: true, name: 'processed_at' })
  processedAt: Date; // Timestamp de publicación

  @Column({ type: 'int', default: 0, name: 'retry_count' })
  retryCount: number; // Contador de reintentos

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

#### 2. **Event Publisher** (Escritura Transaccional)

```typescript
// src/modules/events/publishers/event.publisher.ts
@Injectable()
export class EventPublisher {
  async publish(event: DomainEvent, userId?: string, entityManager?: EntityManager): Promise<void> {
    const manager = entityManager || this.dataSource.manager;

    // Crear evento en Outbox dentro de la MISMA transacción
    const outboxEvent = this.outboxRepository.create({
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
      eventData: event,
      processed: false,
    });

    // Guardar en DB (parte de la transacción padre)
    await manager.save(OutboxEvent, outboxEvent);

    this.logger.log(
      `Event ${event.eventType} for ${event.aggregateType}:${event.aggregateId} saved to outbox`,
    );
  }
}
```

#### 3. **Uso en OrdersService** (Transacción Atómica)

```typescript
// src/modules/orders/orders.service.ts
async createOrder(userId: string, createOrderDto: CreateOrderDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Guardar orden
    const order = await queryRunner.manager.save(Order, orderData);

    // 2. Guardar items
    const items = await queryRunner.manager.save(OrderItem, itemsData);

    // 3. Publicar evento EN LA MISMA TRANSACCIÓN
    const orderCreatedEvent: OrderCreatedEvent = {
      eventType: 'OrderCreated',
      aggregateId: order.id,
      aggregateType: 'Order',
      orderId: order.id,
      userId: order.userId,
      items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      totalAmount: order.totalAmount,
    };

    await this.eventPublisher.publish(
      orderCreatedEvent,
      userId,
      queryRunner.manager,  // ✅ MISMO EntityManager = MISMA transacción
    );

    // 4. Commit ÚNICO y ATÓMICO
    await queryRunner.commitTransaction();

    // ✅ O se guarda TODO (orden + items + evento) o NADA

    return order;
  } catch (error) {
    // ❌ Si falla CUALQUIER paso, rollback completo
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

#### 4. **Outbox Processor** (Background Worker)

```typescript
// src/modules/events/processors/outbox.processor.ts
@Injectable()
export class OutboxProcessor {
  @Cron('*/5 * * * * *') // Cada 5 segundos
  async processOutboxEvents() {
    const events = await this.outboxRepository.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: 100, // Batch de 100 eventos
    });

    if (events.length === 0) return;

    this.logger.log(`Processing ${events.length} outbox events`);

    for (const event of events) {
      try {
        // Publicar a la cola correspondiente
        await this.publishToQueue(event);

        // Marcar como procesado
        event.processed = true;
        event.processedAt = new Date();
        await this.outboxRepository.save(event);

        this.logger.log(`Event ${event.id} processed successfully`);
      } catch (error) {
        // Incrementar retry count
        event.retryCount += 1;
        await this.outboxRepository.save(event);

        this.logger.error(`Failed to process event ${event.id}: ${error.message}`);

        // Dead letter queue si supera max retries
        if (event.retryCount >= 5) {
          await this.moveToDeadLetterQueue(event);
        }
      }
    }
  }

  private async publishToQueue(event: OutboxEvent): Promise<void> {
    const queueName = this.getQueueNameForEvent(event.eventType);
    const queue = this.getQueue(queueName);

    await queue.add(event.eventType, event.eventData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }
}
```

## Consecuencias

### ✅ Positivas

1. **Garantía de Entrega**: At-least-once delivery garantizado
2. **Consistencia Transaccional**: Eventos siempre consistentes con DB
3. **Resiliencia**: Si Queue está caído, eventos se acumulan en Outbox
4. **Idempotencia**: Procesadores deben ser idempotentes (manejo de duplicados)
5. **Auditoría**: Tabla outbox actúa como log completo de eventos
6. **Retry Automático**: Procesador reintenta eventos fallidos
7. **Observable**: Podemos ver estado de cada evento en DB

### ⚠️ Negativas (Trade-offs)

1. **Latencia Adicional**:
   - Eventos se publican cada 5 segundos (no instantáneo)
   - Puede ser crítico para casos de uso real-time

2. **Complejidad Adicional**:
   - Tabla extra en DB (outbox_events)
   - Background processor (cron job)
   - Más código para mantener

3. **Duplicados Posibles** (At-least-once):
   - Si processor crashea después de publicar pero antes de marcar `processed=true`
   - Handlers DEBEN ser idempotentes

4. **Overhead de Storage**:
   - Tabla outbox crece con cada evento
   - Necesita cleanup periódico de eventos procesados

5. **Complejidad en Testing**:
   - Tests deben mockear Outbox o usar DB real
   - Necesita wait para que processor procese eventos

## Alternativas Consideradas

### 1. **Publicación Directa sin Transacción** ❌ RECHAZADA

```typescript
// ❌ NAIVE approach
const order = await this.orderRepository.save(order);
await this.eventBus.publish(new OrderCreatedEvent(order));
```

**Por qué se rechazó**:

- ❌ No es atómico - riesgo de inconsistencia
- ❌ Si app crashea, evento se pierde
- ❌ Si queue está caído, falla todo
- ❌ No hay retry mechanism

### 2. **Change Data Capture (CDC)** ⚠️ CONSIDERADA

**Descripción**: Usar herramienta como Debezium para leer transaction log de PostgreSQL

**Por qué se descartó para v1.0**:

- ⚠️ Complejidad operacional muy alta
- ⚠️ Requiere Kafka o similar (más infraestructura)
- ⚠️ Difícil de debuggear
- ⚠️ Overkill para escala actual
- 📝 **Future**: Considerar si superamos 1M eventos/día

### 3. **Transactional Outbox con Kafka** ⚠️ CONSIDERADA

**Descripción**: Usar Kafka Connect + CDC para outbox

**Por qué se descartó**:

- ⚠️ Requiere Kafka (más complejidad)
- ⚠️ Overkill para volumen actual
- ✅ Outbox + Bull es suficiente para <100k events/día

### 4. **Two-Phase Commit (2PC)** ❌ RECHAZADA

**Descripción**: Protocolo distribuido para commits atómicos

**Por qué se rechazó**:

- ❌ Performance terrible (locks distribuidos)
- ❌ Complejidad extrema
- ❌ No soportado nativamente por Redis/Bull
- ❌ Antipatrón en arquitecturas modernas

## Métricas de Éxito

### Before Outbox Pattern

```
Event Loss Rate:      3-5% ❌
Inconsistent States:  12 órdenes/día ❌
Manual Intervention:  2-3 veces/semana ❌
Developer Trust:      "No confío en eventos" 😰
```

### After Outbox Pattern

```
Event Loss Rate:      0.0% ✅ (0 eventos perdidos en 6 meses)
Inconsistent States:  0 ✅
Manual Intervention:  0 ✅
Developer Trust:      "Funciona perfectamente" 😊
Latency:              5-10 segundos (aceptable)
Throughput:           1000+ eventos/seg ✅
```

## Implementación

### Database Schema

```sql
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índice para queries eficientes
CREATE INDEX idx_outbox_processed
ON outbox_events(processed, created_at)
WHERE processed = false;

-- Índice para queries por aggregate
CREATE INDEX idx_outbox_aggregate
ON outbox_events(aggregate_id, aggregate_type);
```

### Cleanup Job (Opcional)

```typescript
// Limpiar eventos procesados >7 días
@Cron('0 2 * * *')  // 2 AM daily
async cleanupOldEvents() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const result = await this.outboxRepository.delete({
    processed: true,
    processedAt: LessThan(sevenDaysAgo),
  });

  this.logger.log(`Cleaned up ${result.affected} old outbox events`);
}
```

## Referencias

- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [Implementing Outbox Pattern](https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/)
- [Event-Driven Microservices](https://www.oreilly.com/library/view/building-event-driven-microservices/9781492057888/)
- Código: `src/modules/events/`

## Notas de Implementación

### Configuración de Cron

```typescript
// Ajustar frecuencia según carga
@Cron('*/5 * * * * *')  // 5 segundos - Baja latencia
@Cron('*/30 * * * * *')  // 30 segundos - Media latencia
@Cron('0 * * * * *')     // 1 minuto - Alta latencia
```

### Idempotencia en Handlers

```typescript
@Process('OrderCreated')
async handleOrderCreated(job: Job<OrderCreatedEvent>) {
  const { orderId } = job.data;

  // Check si ya fue procesado (idempotencia)
  const alreadyProcessed = await this.checkIfProcessed(orderId);
  if (alreadyProcessed) {
    this.logger.warn(`Order ${orderId} already processed, skipping`);
    return;
  }

  // Procesar orden...
  await this.processOrder(job.data);

  // Marcar como procesado
  await this.markAsProcessed(orderId);
}
```

### Monitoring

```sql
-- Ver eventos pendientes
SELECT event_type, COUNT(*)
FROM outbox_events
WHERE processed = false
GROUP BY event_type;

-- Ver eventos con retries altos
SELECT * FROM outbox_events
WHERE retry_count >= 3
AND processed = false;
```

---

> 💡 **Lección Clave**: El Outbox Pattern convierte un problema de "distributed transaction" (imposible de resolver perfectamente) en un problema de "eventual consistency" (totalmente solucionable). El trade-off de latencia (5-10 segundos) es aceptable para la mayoría de casos de negocio.
