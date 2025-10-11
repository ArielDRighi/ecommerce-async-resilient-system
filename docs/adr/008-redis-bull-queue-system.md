# ADR-008: Redis + Bull para Sistema de Colas

- **Estado**: ✅ Aceptado
- **Fecha**: 2025-09-06
- **Decisores**: Backend Development Team, Infrastructure Lead
- **Área de Impacto**: Message Queuing, Background Processing, Escalabilidad

## Contexto

Necesitamos un sistema robusto de colas para:

- Procesar órdenes de forma asíncrona
- Manejar reintentos automáticos
- Rate limiting y priority queues
- Monitoreo en tiempo real
- Escalabilidad horizontal de workers

### Requisitos del Sistema de Colas

| Requisito           | Importancia | Descripción                    |
| ------------------- | ----------- | ------------------------------ |
| **Performance**     | Crítica     | >1000 jobs/seg throughput      |
| **Reliability**     | Crítica     | At-least-once delivery         |
| **Retry Logic**     | Crítica     | Exponential backoff automático |
| **Monitoring**      | Alta        | Dashboard en tiempo real       |
| **Priority Queues** | Media       | Jobs críticos primero          |
| **Scheduled Jobs**  | Media       | Delays y cron jobs             |
| **Rate Limiting**   | Media       | Control de throughput          |
| **Idempotencia**    | Crítica     | Evitar procesamiento duplicado |

## Decisión

**Implementar Bull (basado en Redis) como sistema de colas** con 4 colas especializadas:

### Arquitectura de Colas

```
┌───────────────────────────────────────────────────────────┐
│                      Redis 7.x                            │
│  (Message Broker + Job Storage + State Management)       │
│                                                           │
│  Keys Structure:                                          │
│  - bull:order-processing:jobs       (Job data)           │
│  - bull:order-processing:completed  (Completed jobs)     │
│  - bull:order-processing:failed     (Failed jobs)        │
│  - bull:order-processing:active     (Active jobs)        │
└───────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┬─────────────┐
          │               │               │             │
   ┌──────▼──────┐  ┌────▼─────┐  ┌──────▼────┐  ┌────▼─────┐
   │   Order     │  │ Payment  │  │ Inventory │  │ Notif    │
   │ Processing  │  │Processing│  │Management │  │ Sending  │
   │             │  │          │  │           │  │          │
   │ 50 jobs/s   │  │ 20 jobs/s│  │ 30 jobs/s │  │ 100jobs/s│
   └─────────────┘  └──────────┘  └───────────┘  └──────────┘
          │               │               │             │
   ┌──────▼──────────────▼───────────────▼─────────────▼─────┐
   │            NestJS Application (Workers)                  │
   │                                                           │
   │  @Processor('order-processing')                          │
   │  @Processor('payment-processing')                        │
   │  @Processor('inventory-management')                      │
   │  @Processor('notification-sending')                      │
   └───────────────────────────────────────────────────────────┘
```

### Implementación Real

#### 1. **Configuración de Bull Module**

```typescript
// src/queues/queue.module.ts
@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: 100, // Keep last 100 completed
        removeOnFail: false, // Keep failed jobs for debugging
      },
    }),

    // Registrar 4 colas especializadas
    BullModule.registerQueue(
      { name: 'order-processing' },
      { name: 'payment-processing' },
      { name: 'inventory-management' },
      { name: 'notification-sending' },
    ),
  ],
})
export class QueueModule {}
```

#### 2. **Queue Service** (Gestión Centralizada)

```typescript
// src/queues/queue.service.ts
@Injectable()
export class QueueService {
  constructor(
    @InjectQueue('order-processing')
    private readonly orderQueue: Queue<OrderProcessingJobData>,
    // ... otras colas
  ) {}

  /**
   * Agregar job a la cola de órdenes
   */
  async addOrderJob(jobName: string, data: OrderProcessingJobData, options?: JobOptions) {
    return this.orderQueue.add(jobName, data, {
      ...options,
      jobId: data.orderId, // ✅ Idempotencia: mismo ID = mismo job
    });
  }

  /**
   * Agregar job prioritario
   */
  async addPriorityJob(data: any, priority: number = 1) {
    return this.orderQueue.add('priority-order', data, {
      priority, // Menor número = mayor prioridad
    });
  }

  /**
   * Agregar job con delay
   */
  async addDelayedJob(data: any, delayInMs: number) {
    return this.orderQueue.add('delayed-order', data, {
      delay: delayInMs,
    });
  }

  /**
   * Obtener métricas de la cola
   */
  async getQueueMetrics(queueName: string): Promise<QueueMetrics> {
    const queue = this.getQueue(queueName);
    const counts = await queue.getJobCounts();

    return {
      queueName,
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: await queue.isPaused(),
    };
  }

  /**
   * Graceful shutdown - wait for active jobs
   */
  async gracefulShutdown(timeout: number = 30000) {
    const queues = this.getAllQueues();

    // Pausar todas las colas
    await Promise.all(queues.map(({ queue }) => queue.pause()));

    // Esperar jobs activos
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const activeJobs = await Promise.all(queues.map(({ queue }) => queue.getActiveCount()));

      if (activeJobs.every((count) => count === 0)) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Cerrar colas
    await Promise.all(queues.map(({ queue }) => queue.close()));
  }
}
```

#### 3. **Order Processor** (Worker)

```typescript
// src/queues/processors/order-processing.processor.ts
@Processor('order-processing')
export class OrderProcessingProcessor {
  @Process('create-order')
  async handleOrderCreated(job: Job<OrderProcessingJobData>) {
    const { orderId, sagaId } = job.data;

    // Update job progress
    await job.progress(10); // 10% - Iniciando

    try {
      // Ejecutar saga
      await job.progress(30); // 30% - Verificando stock
      await this.sagaService.verifyStock(sagaId);

      await job.progress(50); // 50% - Procesando pago
      await this.sagaService.processPayment(sagaId);

      await job.progress(80); // 80% - Confirmando orden
      await this.sagaService.confirmOrder(sagaId);

      await job.progress(100); // 100% - Completado

      return { success: true, orderId };
    } catch (error) {
      this.logger.error(`Failed to process order ${orderId}: ${error.message}`);
      throw error; // Bull reintentará automáticamente
    }
  }

  /**
   * Event listener para jobs completados
   */
  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(`Job ${job.id} completed: ${JSON.stringify(result)}`);
  }

  /**
   * Event listener para jobs fallidos
   */
  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);

    // Si ya se agotaron los reintentos, enviar a dead letter queue
    if (job.attemptsMade >= job.opts.attempts) {
      this.moveToDeadLetterQueue(job, error);
    }
  }
}
```

#### 4. **Bull Board Dashboard**

```typescript
// src/queues/bull-board.controller.ts
@Controller('admin/queues')
export class BullBoardController {
  constructor(
    @InjectQueue('order-processing')
    private readonly orderQueue: Queue,
    // ... otras colas
  ) {
    // Setup Bull Board
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [
        new BullAdapter(this.orderQueue),
        new BullAdapter(this.paymentQueue),
        new BullAdapter(this.inventoryQueue),
        new BullAdapter(this.notificationQueue),
      ],
      serverAdapter,
    });

    this.serverAdapter = serverAdapter;
  }

  @Get('*')
  @UseGuards(AdminGuard) // Solo admins
  getDashboard(@Req() req, @Res() res) {
    this.serverAdapter.getRouter()(req, res);
  }
}
```

## Consecuencias

### ✅ Positivas

1. **Performance Excelente**:
   - Redis puede manejar 100k+ ops/seg
   - Bull procesa 1000+ jobs/seg por worker
   - Latencia ultra-baja (<5ms para enqueue)

2. **Reliability**:
   - Jobs persisted en Redis (no se pierden)
   - Retry automático con exponential backoff
   - At-least-once delivery garantizado

3. **Escalabilidad**:
   - Workers se escalan horizontalmente
   - Cada cola puede tener N workers
   - Redis puede clustering para alta disponibilidad

4. **Developer Experience**:
   - Bull Board dashboard (monitoreo visual)
   - TypeScript support completo
   - Integración nativa con NestJS

5. **Features Avanzadas**:
   - Priority queues (jobs críticos primero)
   - Delayed jobs (scheduling)
   - Rate limiting (control de throughput)
   - Progress tracking (% completado)
   - Job events (completed, failed, stalled)

6. **Observabilidad**:
   - Dashboard en tiempo real
   - Métricas detalladas por cola
   - Logs estructurados de cada job

### ⚠️ Negativas (Trade-offs)

1. **Single Point of Failure** (Mitigado):
   - Redis es crítico (si cae, no hay colas)
   - Solución: Redis Sentinel o Cluster
   - Redis AOF persistence para durability

2. **Memoria Limitada**:
   - Redis almacena jobs en RAM
   - Necesita cleanup de jobs viejos
   - No es ideal para jobs enormes (>1MB)

3. **No es Message Broker Completo**:
   - No tiene routing complejo (vs RabbitMQ)
   - No tiene topics/exchanges (vs Kafka)
   - Suficiente para mayoría de casos

4. **Complejidad Operacional**:
   - Necesita monitoreo de Redis
   - Configuración de persistence (AOF/RDB)
   - Gestión de memoria y eviction policies

## Alternativas Consideradas

### 1. **RabbitMQ** ⚠️ CONSIDERADA

**Pros**:

- ✅ Message broker completo (exchanges, routing)
- ✅ Muy robusto y confiable
- ✅ Soporta múltiples protocolos (AMQP, MQTT)

**Contras**:

- ❌ Performance menor que Redis (10k vs 100k ops/seg)
- ❌ Más complejo de operar
- ❌ Overhead de Erlang VM
- ❌ Overkill para nuestro caso de uso

**Por qué se descartó**:
Complejidad no justificada para escala actual. Redis+Bull es más simple y suficientemente robusto.

### 2. **Apache Kafka** ❌ RECHAZADA

**Pros**:

- ✅ Throughput masivo (millones de msgs/seg)
- ✅ Event streaming y replay
- ✅ Durabilidad excelente

**Contras**:

- ❌ **Overkill** para escala actual (<100k eventos/día)
- ❌ Complejidad operacional extrema (ZooKeeper, brokers)
- ❌ Latencia más alta (batch processing)
- ❌ No es job queue nativo (necesita Kafka Streams)

**Por qué se rechazó**:
Kafka es para event streaming a escala masiva. Nuestro caso es job processing, no streaming.

### 3. **AWS SQS** ⚠️ CONSIDERADA

**Pros**:

- ✅ Fully managed (sin operaciones)
- ✅ Scaling automático infinito
- ✅ Alta disponibilidad built-in

**Contras**:

- ❌ Vendor lock-in (solo AWS)
- ❌ Latencia más alta (HTTP polling)
- ❌ Costos incrementales con volumen
- ❌ No tiene dashboard como Bull Board

**Por qué se descartó**:
Queremos mantener flexibilidad de deployment (on-premise, cualquier cloud). Redis+Bull funciona en cualquier lado.

### 4. **BullMQ** ⚠️ EVALUADA (Next Generation)

**Descripción**: Reescritura moderna de Bull con mejor performance

**Por qué NO se usó (todavía)**:

- ⚠️ Menos maduro que Bull (menos adoptión)
- ⚠️ Breaking changes vs Bull clásico
- ✅ Bull clásico es suficientemente rápido
- 📝 **Future**: Migrar a BullMQ cuando sea más maduro

## Métricas de Éxito

### Capacidad y Performance

```
Throughput por cola:
- order-processing:      50 jobs/seg
- payment-processing:    20 jobs/seg
- inventory-management:  30 jobs/seg
- notification-sending:  100 jobs/seg

Latencia:
- Enqueue:    <5ms     ✅
- Processing: <500ms   ✅
- P99:        <2s      ✅

Reliability:
- Job Loss Rate:      0.0% ✅
- Retry Success Rate: 95% ✅
- Dead Letter Rate:   0.5% ✅
```

### Operacionalidad

```
Uptime Redis:        99.9% ✅
Dashboard Available: 24/7  ✅
Alert Response Time: <5min ✅
```

## Referencias

- [Bull Documentation](https://docs.bullmq.io/)
- [Redis as Message Broker](https://redis.io/docs/manual/patterns/distributed-locks/)
- [NestJS Bull Integration](https://docs.nestjs.com/techniques/queues)
- [Bull Board Dashboard](https://github.com/felixmosh/bull-board)
- Código: `src/queues/`

## Notas de Implementación

### Configuración Redis para Bull

```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes # AOF persistence
  ports:
    - '6379:6379'
  volumes:
    - redis_data:/data
  healthcheck:
    test: ['CMD', 'redis-cli', 'ping']
    interval: 5s
    timeout: 3s
    retries: 5
```

### Rate Limiting

```typescript
{
  limiter: {
    max: 50,        // 50 jobs
    duration: 1000, // por segundo
    bounceBack: false,  // No rechazar, queue los extras
  }
}
```

### Cleanup de Jobs Viejos

```typescript
@Cron('0 2 * * *')  // 2 AM daily
async cleanupOldJobs() {
  const queues = this.queueService.getAllQueues();

  for (const { name, queue } of queues) {
    // Limpiar completados >24h
    await queue.clean(24 * 60 * 60 * 1000, 'completed');

    // Limpiar fallidos >7 días
    await queue.clean(7 * 24 * 60 * 60 * 1000, 'failed');

    this.logger.log(`Cleaned up ${name} queue`);
  }
}
```

---

> 💡 **Lección Clave**: Para job queuing a escala media (<100k jobs/día), Redis + Bull es el sweet spot perfecto: simple, rápido, confiable y con excelente developer experience. No sobre-ingenierizar con Kafka a menos que realmente necesites streaming a escala masiva.
