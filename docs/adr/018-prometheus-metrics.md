# ADR-018: Métricas de Prometheus

**Estado:** Implementado  
**Fecha:** 2024-01-17  
**Autor:** Equipo de Desarrollo  
**ADRs Relacionados:** ADR-017 (Health Checks)

---

## Contexto

Se necesitan **métricas en tiempo real** para monitorear el rendimiento de la aplicación: tasas de requests, tasas de error, latencia, tamaños de colas, estados de circuit breakers.

---

## Decisión

Usar **prom-client** para exposición de métricas Prometheus:

```typescript
/**
 * Prometheus Service
 * Ubicación: src/health/prometheus.service.ts
 */
@Injectable()
export class PrometheusService {
  private readonly registry = new Registry();

  // HTTP metrics
  private readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
  });

  private readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
  });

  // Queue metrics
  private readonly queueJobsWaiting = new Gauge({
    name: 'queue_jobs_waiting',
    help: 'Number of jobs waiting in queue',
    labelNames: ['queue_name'],
  });

  private readonly queueJobsFailed = new Gauge({
    name: 'queue_jobs_failed',
    help: 'Number of failed jobs in queue',
    labelNames: ['queue_name'],
  });

  // Circuit breaker metrics
  private readonly circuitBreakerState = new Gauge({
    name: 'circuit_breaker_state',
    help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
    labelNames: ['name'],
  });

  constructor() {
    this.registry.registerMetric(this.httpRequestDuration);
    this.registry.registerMetric(this.httpRequestsTotal);
    this.registry.registerMetric(this.queueJobsWaiting);
    this.registry.registerMetric(this.queueJobsFailed);
    this.registry.registerMetric(this.circuitBreakerState);
  }

  getMetrics(): string {
    return this.registry.metrics();
  }
}
```

**Metrics Controller:**

```typescript
@Controller()
@Public()
export class MetricsController {
  constructor(private readonly prometheusService: PrometheusService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(@Res() res: Response): Promise<void> {
    const metrics = await this.prometheusService.getMetrics();
    res.send(metrics);
  }
}
```

---

## Métricas Implementadas

**Métricas HTTP:**

- `http_request_duration_seconds` - Histograma de latencia de requests
- `http_request_errors_total` - Contador de errores por código de estado

**Métricas de Órdenes:**

- `orders_processed_total` - Total de órdenes procesadas (por status)
- `order_processing_duration_seconds` - Duración de procesamiento de órdenes (por stage)
- `order_processing_errors_total` - Total de errores de procesamiento (por tipo)

**Métricas de Colas:**

- `queue_length` - Longitud actual de colas de procesamiento
- `queue_job_processing_duration_seconds` - Duración de procesamiento de jobs

**Métricas por Defecto (prom-client):**

- `ecommerce_process_cpu_user_seconds_total` - Uso de CPU
- `ecommerce_process_resident_memory_bytes` - Uso de memoria
- `ecommerce_nodejs_gc_duration_seconds` - Duración de Garbage Collection
- Y más métricas estándar de Node.js

---

## Dashboard de Grafana (Planificado)

```
┌─────────────────────────────────────────────┐
│ E-Commerce System Metrics                   │
├─────────────────────────────────────────────┤
│ HTTP Request Rate:     [▄▄▄█▄▄] 230 req/s  │
│ Average Latency:       [▂▃▅▃▂] 45ms         │
│ Error Rate:            [▁▁▁▁▁] 0.3%         │
├─────────────────────────────────────────────┤
│ Queue Jobs Waiting:    [▃▄█▅▃] 45           │
│ Queue Jobs Failed:     [▁▁▂▁▁] 3            │
│ Payment Circuit:       ● CLOSED             │
│ Inventory Circuit:     ● CLOSED             │
├─────────────────────────────────────────────┤
│ Database Connections:  [▄▅▆▅▄] 12/20        │
│ Memory Usage:          [▃▄▅▄▃] 180MB/300MB  │
└─────────────────────────────────────────────┘
```

---

## Beneficios

✅ **Tiempo Real:** Visibilidad instantánea del estado del sistema  
✅ **Alertas:** Activar alertas en umbrales (tasa de error > 5%)  
✅ **Tendencias:** Datos históricos para planificación de capacidad  
✅ **Estándar:** Prometheus = estándar de la industria, funciona con Grafana

---

## Uso

**Acceder a Métricas:**

```bash
curl http://localhost:3000/metrics

# Output (formato Prometheus):
# HELP orders_processed_total Total number of orders processed
# TYPE orders_processed_total counter
orders_processed_total{status="success"} 1234
orders_processed_total{status="failed"} 12

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/api/v1/orders",status_code="200",le="0.5"} 100
...
```

**Integración con Prometheus (Opcional):**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'ecommerce-app'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

---

**Estado:** ✅ **IMPLEMENTADO Y OPERACIONAL**  
**Endpoint:** `GET /metrics` (formato Prometheus)  
**Ubicación:** `src/health/prometheus.service.ts`, `src/health/metrics.controller.ts`  
**Última Actualización:** 2024-01-17
