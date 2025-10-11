# ADR-016: Logging Estructurado con Winston

**Estado:** Aceptado  
**Fecha:** 2024-01-17  
**Autor:** Equipo de Desarrollo  
**ADRs Relacionados:** ADR-005 (NestJS)

---

## Contexto

Los logs son críticos para depurar problemas en producción, pero **logs no estructurados** (texto plano) son difíciles de buscar, analizar y parsear a escala. Se necesita **logging estructurado en JSON** con metadatos (IDs de request, IDs de usuario, timestamps).

---

## Decisión

Usar **Winston 3.x** con integración **nest-winston** para logging estructurado en JSON:

```typescript
/**
 * Winston Logger Service
 * Ubicación: src/common/utils/winston-logger.service.ts
 */
@Injectable()
export class WinstonLoggerService implements LoggerService {
  private readonly logger: winston.Logger;

  constructor(private readonly configService: ConfigService) {
    this.logger = winston.createLogger({
      level: configService.get('app.logging.level'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(), // ✅ JSON Estructurado
      ),
      defaultMeta: {
        service: configService.get('app.name'),
        version: configService.get('app.version'),
        environment: configService.get('app.environment'),
      },
      transports: [
        // Console (dev: pretty, prod: JSON)
        new winston.transports.Console({
          /* ... */
        }),

        // Rotación de archivos (producción)
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          level: 'warn',
          maxSize: '20m',
          maxFiles: '14d',
        }),
        new DailyRotateFile({
          filename: 'logs/combined-%DATE%.log',
          maxSize: '20m',
          maxFiles: '14d',
        }),
      ],
    });
  }

  log(message: string, context?: string, meta?: LogMetadata): void {
    this.logger.info(message, { context, ...meta });
  }

  error(message: string, trace?: string, context?: string, meta?: LogMetadata): void {
    this.logger.error(message, { context, trace, ...meta });
  }

  // Logging de requests HTTP
  logRequest(req: CustomRequest): void {
    this.log('Incoming request', 'HTTP', {
      method: req.method,
      url: req.url,
      correlationId: req.correlationId,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
  }

  logResponse(req: CustomRequest, res: Response, responseTime: number): void {
    this.log('Outgoing response', 'HTTP', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      correlationId: req.correlationId,
    });
  }
}
```

---

## Configuración

```typescript
// app.config.ts
logging: {
  level: process.env['LOG_LEVEL'] || 'info',
  format: process.env['LOG_FORMAT'] || 'json',
  toFile: process.env['LOG_TO_FILE'] === 'true',
  dir: process.env['LOG_DIR'] || './logs',
  maxSize: process.env['LOG_MAX_SIZE'] || '20m',
  maxFiles: process.env['LOG_MAX_FILES'] || '14d',
  colorize: process.env['LOG_COLORIZE'] !== 'false',
  errorFileLevel: process.env['LOG_ERROR_FILE_LEVEL'] || 'warn',
}
```

---

## Formatos de Log

**Desarrollo (Pretty):**

```
[App] Info    2024-01-17 10:30:45  [HTTP] Incoming request +2ms
  method: GET
  url: /api/v1/orders
  correlationId: abc-123
```

**Producción (JSON):**

```json
{
  "level": "info",
  "message": "Incoming request",
  "context": "HTTP",
  "method": "GET",
  "url": "/api/v1/orders",
  "correlationId": "abc-123",
  "timestamp": "2024-01-17T10:30:45.123Z",
  "service": "ecommerce-async-system",
  "version": "1.0.0",
  "environment": "production"
}
```

---

## Beneficios

✅ **Estructurado:** Formato JSON, fácil de parsear/consultar  
✅ **Rastreable:** Correlation IDs rastrean requests a través de servicios  
✅ **Rotación:** Auto-rotación diaria de logs, compresión de logs antiguos  
✅ **Rendimiento:** Escrituras async, no bloqueantes  
✅ **Integración:** Funciona con ELK Stack, Datadog, CloudWatch

---

## Uso

```typescript
@Controller('orders')
export class OrdersController {
  constructor(private readonly logger: WinstonLoggerService) {}

  @Post()
  async createOrder(@Body() dto: CreateOrderDto) {
    this.logger.log('Creating order', 'OrdersController', {
      userId: dto.userId,
      itemCount: dto.items.length,
      total: dto.total,
    });

    try {
      const order = await this.ordersService.create(dto);
      return order;
    } catch (error) {
      this.logger.error('Order creation failed', error.stack, 'OrdersController', {
        userId: dto.userId,
        error: error.message,
      });
      throw error;
    }
  }
}
```

---

**Estado:** ✅ **IMPLEMENTADO Y OPERACIONAL**  
**Código:** `src/common/utils/winston-logger.service.ts`  
**Última Actualización:** 2024-01-17
