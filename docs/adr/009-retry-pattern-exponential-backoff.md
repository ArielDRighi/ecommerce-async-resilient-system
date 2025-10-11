# ADR-009: Retry Pattern with Exponential Backoff

**Status**: Aceptado  
**Fecha**: 2025-10-09  
**Contexto**: Resilience Patterns  
**Relacionado con**: ADR-008 (Bull Queues), ADR-012 (Dead Letter Queue), ADR-003 (Saga Pattern)

---

## 📋 Contexto y Problema

En un sistema asíncrono resiliente, las operaciones pueden fallar temporalmente por:

1. **Network Issues**: Timeout, connection reset, host unreachable
2. **Service Unavailability**: External APIs temporally down (payment gateways, notification services)
3. **Resource Contention**: Database locks, rate limiting
4. **Transient Errors**: Temporary spikes, memory pressure

### Problema Principal

**¿Cómo manejar fallos temporales sin perder jobs ni sobrecargar servicios externos, manteniendo alta disponibilidad y experiencia de usuario consistente?**

### Contexto del Proyecto

```yaml
Requirements:
  - Queues: 4 queues (orders, payments, inventory, notifications)
  - External Services: Payment gateways, email/SMS providers
  - High Availability: 99.9% uptime expected
  - Cost Optimization: Avoid unnecessary retries
  - User Experience: Transparent failure handling
```

---

## 🎯 Decisión

**Adoptamos Retry Pattern con Exponential Backoff usando Bull Queue configuration.**

### Justificación

Bull provee retry mechanisms built-in con backoff strategies configurables per-queue, eliminando necesidad de implementar retry logic manualmente.

```
┌──────────────────────────────────────────────────────────────────┐
│                   Retry Pattern Architecture                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────┐  ┌─────────────────────────────┐   │
│  │   Bull Configuration   │  │  Exponential Backoff        │   │
│  │                        │  │                             │   │
│  │  attempts: 3-5         │  │  Attempt 1: 2s              │   │
│  │  backoff: exponential  │  │  Attempt 2: 4s              │   │
│  │  delay: 2000-5000ms    │  │  Attempt 3: 8s              │   │
│  │  type: exponential     │  │  Attempt 4: 16s             │   │
│  │                        │  │  Attempt 5: 32s             │   │
│  └────────────────────────┘  └─────────────────────────────┘   │
│                                                                   │
│  ┌────────────────────────┐  ┌─────────────────────────────┐   │
│  │  Error Classification  │  │  Dead Letter Queue          │   │
│  │                        │  │                             │   │
│  │  Retryable:            │  │  Max attempts reached →     │   │
│  │  - ECONNRESET          │  │  Move to DLQ                │   │
│  │  - ETIMEDOUT           │  │  - Alert team               │   │
│  │  - NetworkError        │  │  - Manual intervention      │   │
│  │                        │  │  - Log for analysis         │   │
│  │  Non-Retryable:        │  │                             │   │
│  │  - ValidationError     │  │  Immediate failure →        │   │
│  │  - AuthenticationError │  │  Move to DLQ                │   │
│  └────────────────────────┘  └─────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Queue-Specific Retry Policies               │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  Order Processing:  5 attempts, 3s delay, exponential   │  │
│  │  Payment Processing: 3 attempts, 5s delay, exponential  │  │
│  │  Inventory Mgmt:     3 attempts, 2s delay, exponential  │  │
│  │  Notifications:      3 attempts, 5s delay, fixed        │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implementación Real

### 1. **Bull Global Configuration**

#### Redis & Bull Config (redis.config.ts)

```typescript
// src/config/redis.config.ts
export const bullConfig = registerAs(
  'bull',
  (): BullModuleOptions => ({
    redis: {
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      db: parseInt(process.env['BULL_REDIS_DB'] || '1', 10), // Separate DB

      // Connection resilience
      maxRetriesPerRequest: null, // Bull manages retries
      enableOfflineQueue: true,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    },

    // ✅ Default job options for ALL queues
    defaultJobOptions: {
      // Retention
      removeOnComplete: 100, // Keep last 100 completed
      removeOnFail: 50, // Keep last 50 failed

      // ✅ Retry configuration with exponential backoff
      attempts: parseInt(process.env['BULL_DEFAULT_ATTEMPTS'] || '3', 10),
      backoff: {
        type: 'exponential', // 2^n * delay
        delay: 2000, // Start with 2s → 4s → 8s → 16s
      },

      // Timeouts
      timeout: 60000, // 60s job timeout
      stackTraceLimit: 50,
    },

    // Bull settings
    prefix: 'bull',
    settings: {
      lockDuration: 30000, // 30s lock
      lockRenewTime: 15000, // Renew every 15s
      stalledInterval: 30000, // Check stalled jobs every 30s
      maxStalledCount: 2, // Max recoveries for stalled jobs
    },
  }),
);
```

**Key Decisions**:

- ✅ **Exponential Backoff**: Avoids thundering herd problem
- ✅ **Global Defaults**: Consistent behavior across queues
- ✅ **enableOfflineQueue**: Queue jobs even if Redis down
- ✅ **maxStalledCount**: Prevent infinite stalled job loops

---

### 2. **Queue-Specific Retry Policies**

#### Queue Configurations

```typescript
// src/config/redis.config.ts
export const queueConfigs: Record<string, QueueConfig> = {
  // ============ ORDER PROCESSING ============
  'order-processing': {
    name: 'order-processing',
    limiter: {
      max: 50, // 50 jobs per second
      duration: 1000,
    },
    defaultJobOptions: {
      attempts: 5, // More attempts for orders (critical)
      backoff: {
        type: 'exponential',
        delay: 3000, // 3s → 6s → 12s → 24s → 48s
      },
      removeOnComplete: 200,
      removeOnFail: 100,
    },
  },

  // ============ PAYMENT PROCESSING ============
  'payment-processing': {
    name: 'payment-processing',
    limiter: {
      max: 20, // Conservative for payments
      duration: 1000,
    },
    defaultJobOptions: {
      attempts: 3, // Fewer attempts (payment gateway limits)
      backoff: {
        type: 'exponential',
        delay: 5000, // Longer delays: 5s → 10s → 20s
      },
      removeOnComplete: 500, // Keep more payment records
      removeOnFail: 200,
    },
  },

  // ============ INVENTORY MANAGEMENT ============
  'inventory-management': {
    name: 'inventory-management',
    limiter: {
      max: 100, // High throughput
      duration: 1000,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s → 4s → 8s
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },

  // ============ NOTIFICATION SENDING ============
  'notification-sending': {
    name: 'notification-sending',
    limiter: {
      max: 200, // High volume
      duration: 1000,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'fixed', // ✅ Fixed delay for notifications
        delay: 5000, // Always 5s between retries
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  },
};
```

**Retry Strategy by Queue**:

| Queue             | Attempts | Backoff Type | Initial Delay | Max Delay | Rationale                       |
| ----------------- | -------- | ------------ | ------------- | --------- | ------------------------------- |
| **Orders**        | 5        | Exponential  | 3s            | 48s       | Critical flow, more attempts    |
| **Payments**      | 3        | Exponential  | 5s            | 20s       | External API limits             |
| **Inventory**     | 3        | Exponential  | 2s            | 8s        | Internal service, fast recovery |
| **Notifications** | 3        | Fixed        | 5s            | 5s        | Email/SMS, consistent delays    |

---

### 3. **Job Enqueue with Custom Retry Options**

#### Example: Order Processing

```typescript
// src/modules/orders/orders.service.ts
async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.startTransaction();

  try {
    // ... (create order logic)

    await queryRunner.commitTransaction();

    // ✅ Enqueue async processing with custom retry options
    await this.orderProcessingQueue.add(
      'process-order', // Job name
      {
        orderId: order.id,
        sagaId: sagaId,
        userId,
        items: dto.items,
        timestamp: new Date().toISOString(),
      },
      {
        // ✅ Custom retry configuration (overrides defaults)
        attempts: 3, // Override queue default (5)
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s → 4s → 8s
        },
        priority: 10, // High priority
        timeout: 120000, // 2 minutes timeout
      },
    );

    return this.mapToResponseDto(order);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  }
}
```

**Options Available**:

```typescript
interface JobOptions {
  attempts?: number; // Max retries
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number; // Initial delay (ms)
  };
  priority?: number; // 1-10 (higher = more priority)
  delay?: number; // Initial delay before first attempt
  timeout?: number; // Job timeout (ms)
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  stackTraceLimit?: number;
}
```

---

### 4. **Base Processor with Error Classification**

#### Base Processor (base.processor.ts)

```typescript
// src/queues/processors/base.processor.ts
export abstract class BaseProcessor<T extends BaseJobData = BaseJobData> {
  protected abstract readonly logger: Logger;
  protected abstract processJob(data: T, job: Job<T>): Promise<JobResult>;

  async handleJob(job: Job<T>): Promise<JobResult> {
    const startTime = Date.now();

    this.logger.log(`Starting job ${job.id}`, {
      jobId: job.id,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
    });

    try {
      // Update progress
      await this.updateProgress(job, {
        percentage: 0,
        message: 'Job started',
      });

      // Process job
      const result = await this.processJob(job.data, job);
      const duration = Date.now() - startTime;

      this.logger.log(`Job ${job.id} completed in ${duration}ms`);

      return {
        success: true,
        data: result.data,
        processedAt: new Date(),
        duration,
        attemptsMade: job.attemptsMade + 1,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(`Job ${job.id} failed after ${duration}ms`, {
        error: error instanceof Error ? error.message : 'Unknown',
        attemptsMade: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
      });

      // ✅ Determine if error is retryable
      const isRetryable = this.isRetryableError(error);

      // ✅ Move to DLQ if max attempts or non-retryable
      if (!isRetryable || job.attemptsMade + 1 >= (job.opts.attempts || 3)) {
        await this.handleDeadLetter(job, error);
      }

      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: (error as { code?: string }).code,
        },
        processedAt: new Date(),
        duration,
        attemptsMade: job.attemptsMade + 1,
      };
    }
  }

  /**
   * ✅ Error Classification: Retryable vs Non-Retryable
   */
  protected isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Network errors, timeouts (retryable)
      const retryableErrors = [
        'ECONNRESET', // Connection reset by peer
        'ETIMEDOUT', // Operation timed out
        'ECONNREFUSED', // Connection refused
        'EHOSTUNREACH', // Host unreachable
        'NetworkError', // Generic network error
        'TimeoutError', // Timeout error
      ];

      return retryableErrors.some(
        (retryableError) =>
          error.message.includes(retryableError) ||
          (error as { code?: string }).code === retryableError,
      );
    }

    return false; // Unknown errors are NOT retryable
  }

  /**
   * ✅ Dead Letter Queue Handler
   */
  protected async handleDeadLetter(job: Job<T>, error: unknown): Promise<void> {
    this.logger.error(`Job ${job.id} moved to dead letter queue`, {
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
      error: error instanceof Error ? error.message : 'Unknown',
      data: job.data,
    });

    // Production implementation:
    // 1. Save to database table (dead_letter_jobs)
    // 2. Send alert to monitoring (PagerDuty, Slack)
    // 3. Create ticket in issue tracker (Jira)
    // 4. Trigger notification to on-call engineer
  }
}
```

**Error Classification**:

| Category           | Errors                               | Retryable? | Strategy            |
| ------------------ | ------------------------------------ | ---------- | ------------------- |
| **Network**        | ECONNRESET, ETIMEDOUT, ECONNREFUSED  | ✅ Yes     | Exponential backoff |
| **Validation**     | ValidationError, BadRequestException | ❌ No      | Immediate DLQ       |
| **Authentication** | UnauthorizedException, Forbidden     | ❌ No      | Immediate DLQ       |
| **Rate Limiting**  | TooManyRequests (429)                | ✅ Yes     | Exponential backoff |
| **Server Errors**  | InternalServerError (500)            | ✅ Yes     | Exponential backoff |

---

### 5. **Order Processing Processor**

#### Implementation

```typescript
// src/queues/processors/order-processing.processor.ts
@Processor('order-processing')
export class OrderProcessingProcessor extends BaseProcessor<OrderProcessingJobData> {
  protected readonly logger = new Logger(OrderProcessingProcessor.name);
  protected readonly processorName = 'OrderProcessingProcessor';

  constructor(private readonly sagaService: OrderProcessingSagaService) {
    super();
  }

  @Process('process-order')
  async handleProcessOrder(job: Job<OrderProcessingJobData>): Promise<JobResult> {
    return this.handleJob(job); // Uses base processor retry logic
  }

  protected async processJob(
    data: OrderProcessingJobData,
    job: Job<OrderProcessingJobData>,
  ): Promise<JobResult> {
    this.logger.log(`Processing order ${data.orderId} with saga pattern`);

    try {
      // ✅ Update progress
      await this.updateProgress(job, {
        percentage: 10,
        message: 'Starting order processing saga',
        currentStep: 'saga-start',
      });

      // Execute saga (may throw retryable errors)
      const metrics: SagaMetrics = await this.sagaService.executeSaga(data.sagaId);

      // ✅ Update final progress
      await this.updateProgress(job, {
        percentage: 100,
        message: `Saga completed with status: ${metrics.finalStatus}`,
        currentStep: 'saga-complete',
      });

      return {
        success: metrics.finalStatus === 'COMPLETED',
        data: {
          orderId: data.orderId,
          status: metrics.finalStatus,
          totalDurationMs: metrics.totalDurationMs,
        },
        processedAt: new Date(),
        duration: metrics.totalDurationMs,
        attemptsMade: job.attemptsMade + 1,
      };
    } catch (error) {
      // Error logged by base processor
      // Will be retried if isRetryableError() returns true
      throw error;
    }
  }
}
```

---

### 6. **Retry Flow Visualization**

#### Successful Retry Flow

```
Job Enqueued
    ↓
[Attempt 1] → FAIL (ECONNRESET) → Retryable? ✅ Yes
    ↓ Wait 2s (exponential backoff)
[Attempt 2] → FAIL (ETIMEDOUT) → Retryable? ✅ Yes
    ↓ Wait 4s (exponential backoff)
[Attempt 3] → SUCCESS ✅
    ↓
Job Completed
    ↓
Remove from queue (keep last 100 completed)
```

#### Failed Retry Flow (Max Attempts)

```
Job Enqueued
    ↓
[Attempt 1] → FAIL (NetworkError) → Retryable? ✅ Yes
    ↓ Wait 2s
[Attempt 2] → FAIL (NetworkError) → Retryable? ✅ Yes
    ↓ Wait 4s
[Attempt 3] → FAIL (NetworkError) → Max attempts reached!
    ↓
Move to Dead Letter Queue
    ↓
Alert sent to team
    ↓
Manual intervention required
```

#### Non-Retryable Error Flow

```
Job Enqueued
    ↓
[Attempt 1] → FAIL (ValidationError) → Retryable? ❌ No
    ↓
Move to Dead Letter Queue (immediately)
    ↓
Alert sent (high priority)
    ↓
Fix code issue
```

---

## 📊 Evidencias de la Implementación

### Retry Configuration Summary

```yaml
Global Configuration:
  attempts: 3 (default)
  backoff: exponential
  initial_delay: 2000ms
  redis_db: 1 (separate from cache)
  remove_on_complete: 100
  remove_on_fail: 50

Queue-Specific Overrides:
  order-processing:
    attempts: 5
    delay: 3000ms
    max_delay: 48s

  payment-processing:
    attempts: 3
    delay: 5000ms
    max_delay: 20s

  inventory-management:
    attempts: 3
    delay: 2000ms
    max_delay: 8s

  notification-sending:
    attempts: 3
    backoff: fixed
    delay: 5000ms (always)
```

### Error Classification

```typescript
Retryable Errors (7 types):
├── ECONNRESET
├── ETIMEDOUT
├── ECONNREFUSED
├── EHOSTUNREACH
├── NetworkError
├── TimeoutError
└── TooManyRequests (429)

Non-Retryable Errors:
├── ValidationError
├── BadRequestException
├── UnauthorizedException
├── ForbiddenException
└── Business Logic Errors
```

### Metrics

| Métrica                   | Valor | Observación                                |
| ------------------------- | ----- | ------------------------------------------ |
| **Queues with Retry**     | 4     | Orders, Payments, Inventory, Notifications |
| **Default Attempts**      | 3     | Global default                             |
| **Max Attempts**          | 5     | Order processing (critical)                |
| **Retryable Error Types** | 7     | Network, timeout, rate-limit               |
| **Backoff Types**         | 2     | Exponential, Fixed                         |
| **Initial Delays**        | 2-5s  | Per queue type                             |
| **Max Delay**             | 48s   | Order processing queue                     |

---

## ⚖️ Alternativas Consideradas

### Opción 1: Manual Retry Logic en Processors (Rechazada)

**Descripción**: Implementar retry logic dentro de cada processor

```typescript
// ❌ Manual retry (verbose)
async processJob(data: JobData) {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      return await this.execute(data);
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) throw error;
      await this.sleep(Math.pow(2, attempts) * 1000); // Manual backoff
    }
  }
}
```

**Razones de Rechazo**:

- ❌ **Boilerplate**: Repetir en cada processor
- ❌ **Error-Prone**: Fácil olvidar edge cases
- ❌ **No Observability**: Sin métricas built-in
- ❌ **No Configuration**: Hardcoded values

---

### Opción 2: Custom Retry Library (axios-retry) (Rechazada)

**Descripción**: Usar axios-retry para HTTP calls

```typescript
import axiosRetry from 'axios-retry';

axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});
```

**Razones de Rechazo**:

- ⚠️ **Limited Scope**: Solo HTTP calls, no queue jobs
- ⚠️ **Mixing Patterns**: Two retry systems (Bull + axios-retry)
- ⚠️ **Complexity**: Harder to debug
- ✅ **Use Case**: OK para specific HTTP clients

---

### Opción 3: Retry via API Gateway (Rechazada)

**Descripción**: Let API Gateway handle retries

**Razones de Rechazo**:

- ❌ **No Queue Support**: API Gateway can't retry async jobs
- ❌ **Limited Control**: Less granular configuration
- ❌ **Stateless**: Can't track job attempts

---

## 📈 Ventajas de Bull Retry Pattern

### 1. **Built-in Exponential Backoff**

```typescript
// ✅ Configuration-based (no code)
{
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s → 4s → 8s → 16s → 32s
  }
}

// vs ❌ Manual implementation
await this.sleep(Math.pow(2, attempt) * 2000);
```

### 2. **Per-Queue Customization**

```typescript
// ✅ Different strategies per queue
'order-processing': { attempts: 5, delay: 3000 },    // Critical
'payment-processing': { attempts: 3, delay: 5000 },  // External API
'notifications': { backoff: 'fixed', delay: 5000 },  // Consistent
```

### 3. **Observability & Monitoring**

```typescript
// ✅ Built-in events
queue.on('failed', (job, error) => {
  logger.error(`Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts})`);
});

queue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`);
});

queue.on('completed', (job) => {
  logger.log(`Job ${job.id} completed after ${job.attemptsMade} attempts`);
});
```

### 4. **Dead Letter Queue Integration**

```typescript
// ✅ Automatic DLQ after max attempts
if (job.attemptsMade + 1 >= job.opts.attempts) {
  await this.handleDeadLetter(job, error);
}
```

---

## 🎓 Lecciones Aprendidas

### 1. Exponential Backoff Previene Thundering Herd

**Problema**: Sin backoff, todos los jobs reintentan inmediatamente

```
Without Backoff:
T=0s:  1000 jobs fail → All retry at T=0s → Overload!
T=0s:  1000 jobs fail again → Cascade failure

With Exponential Backoff:
T=0s:  1000 jobs fail
T=2s:  ~500 jobs retry (staggered)
T=4s:  ~250 jobs retry
T=8s:  ~125 jobs retry (service recovered)
```

**Lesson**: Exponential backoff prevents service overload during failures

### 2. Queue-Specific Policies Critical

```typescript
// ❌ BAD: Same retry policy for all queues
attempts: 3  // Orders fail after 3 attempts (data loss!)

// ✅ GOOD: Customize per queue
'order-processing': { attempts: 5 },     // More attempts
'notifications': { backoff: 'fixed' },   // Fixed delay OK
```

**Lesson**: Critical flows (orders) need more retries than non-critical (notifications)

### 3. Error Classification Prevents Infinite Retries

```typescript
// ❌ BAD: Retry everything
catch (error) {
  throw error; // Retries ValidationError (useless!)
}

// ✅ GOOD: Classify errors
if (!this.isRetryableError(error)) {
  await this.handleDeadLetter(job, error);
  return; // Don't retry
}
```

**Lesson**: ValidationErrors, AuthErrors should NOT retry (immediate DLQ)

### 4. Keep Failed Jobs for Analysis

```typescript
// ✅ GOOD: Keep failed jobs
removeOnFail: 100, // Keep last 100 for debugging

// ❌ BAD: Remove immediately
removeOnFail: true, // Lose error information!
```

**Lesson**: Failed jobs are gold for debugging production issues

---

## 🔄 Evolución Futura

### Fase Actual: Bull Retry with Exponential Backoff

```
✅ 4 queues with retry configured
✅ Exponential backoff (2-5s initial delay)
✅ Queue-specific policies (3-5 attempts)
✅ Error classification (retryable vs non-retryable)
✅ Dead Letter Queue handling
```

### Fase 2: Advanced Retry Strategies

```typescript
// Adaptive backoff (adjust based on queue load)
backoff: {
  type: 'adaptive',
  baseDelay: 2000,
  factor: (attempt, queueLoad) => {
    return attempt * 1000 * (queueLoad / 100);
  }
}

// Jitter (randomize delays to prevent synchronization)
backoff: {
  type: 'exponential',
  delay: 2000,
  jitter: 0.5, // ±50% randomization
}
```

### Fase 3: Circuit Breaker Integration

```typescript
// Skip retries if circuit open
protected async processJob(data: JobData) {
  if (this.circuitBreaker.isOpen()) {
    throw new ServiceUnavailableException('Circuit open');
  }

  return await this.execute(data);
}
```

### Fase 4: Distributed Tracing

```typescript
// Trace retries across services
await this.orderQueue.add('process-order', data, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  headers: {
    'trace-id': traceId,
    'parent-span-id': spanId,
  },
});
```

---

## 📝 Conclusión

**Elegimos Bull Retry Pattern con Exponential Backoff** porque provee retry mechanisms built-in, configurables per-queue, con error classification y Dead Letter Queue integration, eliminando necesidad de implementar retry logic manualmente.

**Decisión Final**: ✅ Aceptado

**Justificación**:

1. ✅ **Built-in Support**: Bull provee retry out-of-the-box
2. ✅ **Exponential Backoff**: Prevents thundering herd
3. ✅ **Per-Queue Customization**: 5 attempts (orders), 3 attempts (payments)
4. ✅ **Error Classification**: Retryable vs non-retryable
5. ✅ **DLQ Integration**: Auto-move failed jobs after max attempts
6. ✅ **Observability**: Events (failed, completed, stalled)
7. ✅ **Configuration-Based**: No code, just config

**Trade-offs Aceptados**:

- ⚠️ Fixed strategies (exponential, fixed) → No adaptive backoff (yet)
- ⚠️ No jitter → Possible synchronized retries (rare)
- ⚠️ Bull-specific → Coupling to Bull (OK, unlikely to change)

**Firmantes**:

- Arquitectura: ✅ Aprobado
- Backend Team: ✅ Implementado
- DevOps: ✅ Monitored

---

## 🔗 Referencias

### Documentación Interna

- [ADR-008: Bull Queue System](008-redis-bull-queue-system.md)
- [ADR-012: Dead Letter Queue](012-dead-letter-queue-handling.md)
- [ADR-003: Saga Pattern](003-saga-pattern-orchestration.md)

### Código Fuente Clave

```
src/config/redis.config.ts                      # Bull retry configuration
  - bullConfig (global defaults)
  - queueConfigs (per-queue overrides)

src/queues/processors/base.processor.ts         # Base processor with error classification
  - isRetryableError() (L114-131)
  - handleDeadLetter() (L137-151)

src/queues/processors/order-processing.processor.ts # Order processor
src/modules/orders/orders.service.ts            # Job enqueue (L177-197)
```

### Recursos Externos

- Bull Docs: https://github.com/OptimalBits/bull
- Exponential Backoff: https://en.wikipedia.org/wiki/Exponential_backoff
- Retry Pattern: https://docs.microsoft.com/azure/architecture/patterns/retry

---

**Última Revisión**: 2025-10-09  
**Próxima Revisión**: Al considerar adaptive backoff o circuit breaker integration
