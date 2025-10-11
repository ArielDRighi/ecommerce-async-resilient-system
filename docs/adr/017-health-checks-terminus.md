# ADR-017: Health Checks con Terminus

**Estado:** Aceptado  
**Fecha:** 2024-01-17  
**Autor:** Equipo de Desarrollo  
**ADRs Relacionados:** ADR-005 (NestJS), ADR-006 (PostgreSQL)

---

## Contexto

Docker Compose y balanceadores de carga necesitan saber si la aplicación está saludable antes de enrutar tráfico. Se necesitan **endpoints de salud** para liveness (¿está corriendo la app?) y readiness (¿puede la app manejar tráfico?).

---

## Decisión

Usar **@nestjs/terminus** para health checks con indicadores personalizados:

```typescript
/**
 * Health Controller
 * Ubicación: src/health/health.controller.ts
 */
@Controller('health')
@Public() // No requiere autenticación
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.healthService.check();
  }

  @Get('ready')
  @HealthCheck()
  async checkReadiness(): Promise<HealthCheckResult> {
    return this.healthService.checkReadiness();
  }

  @Get('live')
  @HealthCheck()
  async checkLiveness(): Promise<HealthCheckResult> {
    return this.healthService.checkLiveness();
  }
}
```

**Health Service:**

```typescript
/**
 * Health Service
 * Ubicación: src/health/health.service.ts
 */
@Injectable()
export class HealthService {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    @InjectQueue('order-processing') private orderQueue: Queue,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const heapThreshold = process.env['NODE_ENV'] === 'test'
      ? 1000 * 1024 * 1024  // 1GB para tests
      : 150 * 1024 * 1024;  // 150MB para producción

    const rssThreshold = process.env['NODE_ENV'] === 'test'
      ? 1200 * 1024 * 1024  // 1.2GB para tests
      : 300 * 1024 * 1024;  // 300MB para producción

    return this.health.check([
      // Conectividad de base de datos
      () => this.db.pingCheck('database'),

      // Uso de memoria heap (< 150MB producción, < 1GB tests)
      () => this.memory.checkHeap('memory_heap', heapThreshold),

      // Uso de memoria RSS (< 300MB producción, < 1.2GB tests)
      () => this.memory.checkRSS('memory_rss', rssThreshold),

      // Uso de disco (< 90%)
      () =>
        this.disk.checkStorage('storage', {
          path: process.platform === 'win32' ? 'C:\\' : '/',
          thresholdPercent: 0.9,
        }),
    ]);
  }
}
```

---

## Endpoints

**GET /health** - Salud general (todos los checks)

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" },
    "storage": { "status": "up" }
  }
}
```

**GET /health/ready** - Readiness probe (Docker Compose)

- Base de datos conectada

**GET /health/live** - Liveness probe (Docker Compose)

- Proceso de aplicación corriendo
- Memoria dentro de límites

**GET /health/detailed** - Health check detallado

- Todas las verificaciones anteriores
- Información adicional de base de datos

---

## Integración con Docker Compose

```yaml
# docker-compose.yml
services:
  app:
    healthcheck:
      test: ['CMD', 'node', 'health-check.js']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
```

---

## Beneficios

✅ **Monitoreo Automático:** Docker Compose detecta contenedores no saludables  
✅ **Apagado Graceful:** Detiene tráfico antes de terminar  
✅ **Reinicio Automático:** Docker reinicia contenedores que fallan health checks  
✅ **Debugging:** `/health` muestra qué componente está fallando

---

**Estado:** ✅ **IMPLEMENTADO Y OPERACIONAL**  
**Endpoints:** `/health`, `/health/ready`, `/health/live`, `/health/detailed`  
**Última Actualización:** 2024-01-17
