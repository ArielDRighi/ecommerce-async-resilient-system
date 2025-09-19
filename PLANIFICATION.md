### Core Backend

- **Lenguaje:** Go 1.21+
- **Framework Web:** Gin (más popular y performante)
- **Base de Datos:** PostgreSQL (ACID compliance para transacciones críticas)
- **ORM:** GORM (más maduro y usado en la industria)
- **Message Queue:** RabbitMQ (confiabilidad y características empresariales)
- **Cache:** Redis (para idempotencia y optimización)# Sistema Procesador de Órdenes Asíncrono - Diseño Técnico

## Tecnologías Recomendadas - Logging y Documentation

### Logging Stack

- **Structured Logging:** zap (mejor performance que logrus)
- **Log Rotation:** lumberjack (rotación automática por tamaño/tiempo)
- **Correlation IDs:** UUID v4 para trazabilidad de requests
- **Log Aggregation:** Compatible con ELK Stack (Elasticsearch, Logstash, Kibana)
- **Log Sampling:** Para high-throughput environments

### API Documentation

- **Swagger Generation:** swaggo/swag (generación automática desde anotaciones)
- **Swagger UI:** gin-swagger (middleware para servir UI interactivo)
- **API Specification:** OpenAPI 3.0 con ejemplos completos
- **Documentation as Code:** Anotaciones en código para mantener sincronización

### Log Configuration Features

- **Structured JSON:** Para parsing automático en sistemas de monitoreo
- **Log Levels:** DEBUG (desarrollo), INFO (operaciones), WARN (alertas), ERROR (incidentes)
- **Field Standardization:** Campos consistentes (timestamp, level, correlation_id, service, etc.)
- **Sensitive Data Handling:** Automatic redaction para datos PCI/PII
- **Performance Sampling:** Rate limiting para logs de alto volumen

### Herramientas de Desarrollo

- **Migraciones:** golang-migrate
- **Configuración:** Viper
- **Logging:** zap (mejor performance) + lumberjack (rotación de logs)
- **API Documentation:** swaggo/gin-swagger + swaggo/swag (generación automática)
- **Testing:** testify
- **Mocks:** gomock
- **Containerización:** Docker + Docker Compose

### Monitoreo y Observabilidad

- **Metrics:** Prometheus
- **Health Checks:** Gin middleware personalizado
- **Tracing:** OpenTelemetry (opcional)

## Arquitectura del Sistema

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Gateway   │    │  Order Service  │    │ Worker Service  │
│   (Gin HTTP)    │    │                 │    │                 │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │ POST /orders         │                      │
          ▼                      │                      │
┌─────────────────┐             │                      │
│   PostgreSQL    │◄────────────┘                      │
│                 │                                     │
│ - orders        │                                     │
│ - outbox_events │                                     │
│ - order_items   │                                     │
└─────────────────┘                                     │
          │                                             │
          │                                             │
          ▼                                             ▼
┌─────────────────┐                         ┌─────────────────┐
│    RabbitMQ     │◄────────────────────────┤     Redis       │
│                 │                         │                 │
│ - order.created │                         │ - idempotency   │
│ - order.dlq     │                         │ - cache         │
└─────────────────┘                         └─────────────────┘
```

## Diseño de Base de Datos

### Esquema PostgreSQL

```sql
-- Tabla principal de órdenes
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE NULL,

    INDEX idx_orders_customer_id (customer_id),
    INDEX idx_orders_status (status),
    INDEX idx_orders_created_at (created_at)
);

-- Items de la orden
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,

    INDEX idx_order_items_order_id (order_id),
    INDEX idx_order_items_product_id (product_id)
);

-- Patrón Outbox para garantizar consistencia
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE NULL,

    INDEX idx_outbox_events_processed_at (processed_at),
    INDEX idx_outbox_events_created_at (created_at)
);

-- Estados de orden para tracking
CREATE TYPE order_status AS ENUM (
    'pending',
    'stock_verified',
    'payment_processing',
    'payment_completed',
    'confirmed',
    'failed',
    'cancelled'
);

-- Tabla para idempotencia (opcional, también se puede usar Redis)
CREATE TABLE idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    response_body JSONB,
    response_status INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
```

### Relaciones

1. `orders` 1:N `order_items` - Una orden tiene múltiples items
2. `orders` 1:N `outbox_events` - Una orden puede generar múltiples eventos
3. `outbox_events` contiene el payload JSON del evento a publicar

## Estructura de Directorios

```
order-processor/
├── cmd/
│   ├── api/
│   │   └── main.go              # Entry point API service
│   └── worker/
│       └── main.go              # Entry point Worker service
├── internal/
│   ├── config/
│   │   └── config.go            # Configuración con Viper
│   ├── logger/
│   │   ├── logger.go            # Logger con zap configurado
│   │   └── middleware.go        # Middleware de logging para HTTP
│   ├── domain/
│   │   ├── order.go             # Entidades de dominio
│   │   ├── event.go
│   │   └── errors.go
│   ├── repository/
│   │   ├── interfaces.go        # Interfaces de repositorio
│   │   ├── postgres/
│   │   │   ├── order.go         # Implementación PostgreSQL
│   │   │   └── outbox.go
│   │   └── redis/
│   │       └── cache.go         # Implementación Redis
│   ├── service/
│   │   ├── order_service.go     # Lógica de negocio
│   │   ├── payment_service.go   # Mock de servicio de pago
│   │   └── stock_service.go     # Mock de servicio de stock
│   ├── handler/
│   │   └── http/
│   │       ├── order_handler.go # Handlers HTTP
│   │       ├── docs.go          # Documentación Swagger generada
│   │       └── middleware.go
│   ├── messaging/
│   │   ├── publisher.go         # Publisher RabbitMQ
│   │   ├── consumer.go          # Consumer RabbitMQ
│   │   └── events.go            # Definición de eventos
│   └── worker/
│       ├── order_processor.go   # Procesador de órdenes
│       └── outbox_processor.go  # Procesador del patrón outbox
├── pkg/
│   ├── database/
│   │   └── postgres.go          # Conexión PostgreSQL
│   └── queue/
│       └── rabbitmq.go          # Conexión RabbitMQ
├── migrations/
│   ├── 001_create_orders_table.up.sql
│   ├── 001_create_orders_table.down.sql
│   ├── 002_create_outbox_events_table.up.sql
│   └── 002_create_outbox_events_table.down.sql
├── docs/
│   ├── swagger.yaml             # Especificación OpenAPI generada
│   ├── swagger.json
│   └── README.md
├── logs/
│   └── .gitkeep                 # Directorio para logs rotados
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.worker
│   └── docker-compose.yml
├── tests/
│   ├── integration/
│   └── unit/
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

## Backlog de Tareas

### Sprint 1: Fundación del Proyecto

**Objetivo:** Establecer la base del proyecto con configuración, base de datos y estructura básica.

#### Tarea 1: Configuración Inicial del Proyecto

**Prompt para GitHub Copilot:**

```
# Task: Setup Go project foundation with industry standard structure and logging

## Context
Create a new Go project for an asynchronous order processing system. The project will have two services: API service and Worker service with comprehensive logging and documentation.

## Requirements
1. Initialize Go module `github.com/[username]/order-processor`
2. Set up proper directory structure following Go standards
3. Configure basic dependencies:
   - gin-gonic/gin (web framework)
   - gorm.io/gorm and gorm.io/driver/postgres (ORM)
   - streadway/amqp (RabbitMQ client)
   - go-redis/redis/v9 (Redis client)
   - spf13/viper (configuration)
   - go.uber.org/zap (structured logging)
   - gopkg.in/natefinch/lumberjack.v2 (log rotation)
   - github.com/swaggo/gin-swagger (Swagger middleware)
   - github.com/swaggo/swag/cmd/swag (Swagger generation)
4. Create comprehensive logging configuration:
   - Structured JSON logging with zap
   - Log rotation with lumberjack
   - Different log levels for dev/prod environments
   - Request correlation IDs
   - Performance logging
5. Set up Swagger documentation structure:
   - Install swag CLI tool
   - Configure basic Swagger annotations
   - Set up docs generation workflow
6. Create basic configuration structure using Viper
7. Create Makefile with enhanced commands:
   - build, test, docker-build
   - docs-generate (Swagger generation)
   - logs-clean (cleanup rotated logs)
8. Add .gitignore file appropriate for Go projects

## Logging Configuration Requirements
- JSON structured logs for production
- Human-readable logs for development
- Log rotation with size and age limits
- Correlation IDs for request tracing
- Performance metrics logging
- Error stack trace logging
- Configurable log levels per module

## Swagger Configuration Requirements
- Auto-generate docs from code annotations
- Include request/response examples
- Error response documentation
- Authentication documentation structure
- API versioning support

## Acceptance Criteria
- Project compiles successfully with `go build ./...`
- Configuration loads from environment variables and config files
- Logger outputs structured logs with proper rotation
- Makefile commands work correctly including docs generation
- Basic Swagger documentation is accessible at /swagger/index.html
- All dependencies are properly versioned in go.mod
- Logging works consistently across all components
```

#### Tarea 2: Configuración de Base de Datos y Migraciones

**Prompt para GitHub Copilot:**

```
# Task: Database setup with PostgreSQL and migrations

## Context
Set up PostgreSQL database schema for the order processing system using GORM and golang-migrate.

## Requirements
1. Install and configure golang-migrate for database migrations
2. Create migration files for the complete database schema:
   - orders table with proper indexes
   - order_items table with foreign key relationship
   - outbox_events table for the outbox pattern
   - idempotency_keys table for request idempotency
3. Set up GORM models that match the database schema
4. Create database connection package with proper connection pooling
5. Add database health check functionality
6. Create seed data for development/testing

## Database Schema Requirements
- Use UUIDs as primary keys
- Proper indexes for performance
- JSONB fields where appropriate
- Timestamps with timezone
- Proper constraints and foreign keys

## Acceptance Criteria
- Migrations run successfully both up and down
- GORM models are properly tagged and structured
- Database connection works with connection pooling
- Health check returns database status
- Seed data populates correctly
```

#### Tarea 3: Configuración de Message Queue (RabbitMQ)

**Prompt para GitHub Copilot:**

```
# Task: RabbitMQ setup with connection management and basic messaging

## Context
Configure RabbitMQ for asynchronous message processing in the order system. Need proper connection management, queues, and exchanges setup.

## Requirements
1. Create RabbitMQ connection package with:
   - Connection pooling and reconnection logic
   - Graceful shutdown handling
   - Health check functionality
2. Set up exchange and queue topology:
   - Main exchange: "orders.exchange" (topic type)
   - Queue: "orders.created" with routing key "order.created"
   - Dead Letter Queue: "orders.dlq" for failed messages
3. Create publisher interface and implementation:
   - Message publishing with confirmation
   - Proper error handling and retries
   - Message serialization to JSON
4. Create consumer interface and basic implementation:
   - Message consumption with acknowledgments
   - Error handling and requeue logic
   - Graceful shutdown support
5. Add RabbitMQ configuration to the config structure

## Acceptance Criteria
- RabbitMQ connection establishes successfully
- Queues and exchanges are created automatically
- Publisher can send messages reliably
- Consumer can receive messages with proper acknowledgment
- Dead letter queue handles failed messages
- Health check reports RabbitMQ status
```

### Sprint 2: Core API Implementation

**Objetivo:** Implementar el API REST para crear órdenes con el patrón Outbox.

#### Tarea 4: Implementación de Entidades de Dominio

**Prompt para GitHub Copilot:**

```
# Task: Domain entities and business logic models

## Context
Create domain entities for the order processing system following Domain-Driven Design principles.

## Requirements
1. Create domain entities in internal/domain/:
   - Order entity with all business rules and validation
   - OrderItem entity with quantity and pricing validation
   - Event entity for outbox pattern
   - Custom error types for business logic
2. Implement business logic methods on entities:
   - Order creation validation
   - Order status transitions
   - Total calculation with proper decimal handling
   - Event creation for outbox pattern
3. Create value objects:
   - OrderStatus enum with valid transitions
   - Money value object for currency handling
   - Email value object with validation
4. Add comprehensive validation:
   - Email format validation
   - Positive amounts and quantities
   - Status transition rules
5. Implement domain events:
   - OrderCreatedEvent
   - OrderProcessedEvent
   - OrderFailedEvent

## Acceptance Criteria
- All entities have proper validation methods
- Business rules are enforced at the domain level
- Value objects prevent invalid states
- Events are properly structured for serialization
- Unit tests cover all business logic
- No dependencies on external frameworks in domain layer
```

#### Tarea 5: Repository Pattern Implementation

**Prompt para GitHub Copilot:**

```
# Task: Repository pattern with PostgreSQL implementation

## Context
Implement repository pattern for data persistence using GORM with PostgreSQL, including the outbox pattern implementation.

## Requirements
1. Create repository interfaces in internal/repository/interfaces.go:
   - OrderRepository interface with CRUD operations
   - OutboxRepository interface for event management
   - TransactionManager interface for unit of work pattern
2. Implement PostgreSQL repositories:
   - OrderRepository with GORM implementation
   - OutboxRepository with atomic operations
   - Proper transaction handling
3. Implement the outbox pattern:
   - Atomic write of order + outbox event in single transaction
   - Outbox event polling mechanism
   - Event processing with idempotency
4. Add repository methods:
   - Create order with items in transaction
   - Find orders with pagination and filtering
   - Update order status
   - Mark outbox events as processed
5. Implement proper error handling:
   - Convert GORM errors to domain errors
   - Handle constraint violations
   - Connection error recovery

## Acceptance Criteria
- Repository interfaces define clean contracts
- PostgreSQL implementation handles all operations correctly
- Outbox pattern ensures atomic writes
- Transactions are properly managed
- Error handling is comprehensive
- Integration tests verify repository behavior
```

#### Tarea 6: HTTP API Handlers con Swagger Documentation

**Prompt para GitHub Copilot:**

```
# Task: HTTP API implementation with Gin framework and comprehensive Swagger documentation

## Context
Create REST API endpoints using Gin framework with proper middleware, error handling, request/response validation, and complete Swagger documentation.

## Requirements
1. Create HTTP handlers in internal/handler/http/:
   - OrderHandler with fully documented CRUD endpoints
   - Health check handler with system status
   - Proper request/response DTOs with validation tags
   - Complete Swagger annotations for all endpoints
2. Implement API endpoints with Swagger docs:
   - POST /api/v1/orders (create order - returns 202 Accepted)
   - GET /api/v1/orders/:id (get order details)
   - GET /api/v1/orders (list orders with pagination)
   - GET /health (health check endpoint)
   - GET /swagger/* (Swagger UI endpoints)
3. Create comprehensive Swagger annotations:
   - @Summary, @Description for all endpoints
   - @Tags for API grouping
   - @Accept, @Produce content types
   - @Param for all parameters (path, query, body)
   - @Success, @Failure for all response codes
   - @Router for routing information
4. Create middleware with logging integration:
   - Request logging with correlation IDs and zap logger
   - Error handling middleware with structured error logging
   - Request validation middleware
   - Rate limiting (using Redis)
   - CORS configuration
   - Request/response timing logs
5. Implement request/response models with Swagger tags:
   - CreateOrderRequest with validation and example tags
   - OrderResponse with proper JSON and example annotations
   - Error response structure with Swagger documentation
   - Pagination response wrapper with examples
   - Health check response model
6. Add comprehensive error handling and logging:
   - Convert domain errors to HTTP status codes
   - Structured error responses with correlation IDs
   - Detailed error logging with context
   - Performance logging for all endpoints

## Swagger Documentation Requirements
- Complete OpenAPI 3.0 specification
- Request/response examples for all endpoints
- Error response documentation with status codes
- Authentication placeholder structure
- API versioning documentation
- Interactive Swagger UI at /swagger/index.html

## Logging Requirements
- Request start/end logging with duration
- Error logging with full context and stack traces
- Performance metrics logging
- User action logging for audit trails
- Correlation ID propagation through all logs

## Acceptance Criteria
- All endpoints return proper HTTP status codes
- Request validation works correctly with detailed error messages
- Error responses are well-structured and logged properly
- Middleware functions properly with comprehensive logging
- Complete Swagger documentation is generated and accessible
- All logs include correlation IDs and proper context
- Integration tests cover all endpoints with logging verification
```

### Sprint 3: Asynchronous Processing

**Objetivo:** Implementar el worker que procesa las órdenes de forma asíncrona.

#### Tarea 7: Outbox Pattern Processor con Structured Logging

**Prompt para GitHub Copilot:**

```
# Task: Outbox pattern processor for reliable message publishing with comprehensive logging

## Context
Implement the outbox pattern processor that polls the outbox_events table and publishes messages to RabbitMQ reliably, with detailed logging for monitoring and debugging.

## Requirements
1. Create OutboxProcessor in internal/worker/ with logging:
   - Poll outbox_events table for unprocessed events
   - Publish events to RabbitMQ with confirmation
   - Mark events as processed atomically
   - Handle publishing failures with retry logic
   - Comprehensive structured logging throughout
2. Implement polling mechanism with logging:
   - Configurable polling interval
   - Batch processing for efficiency with batch size logging
   - Graceful shutdown handling with shutdown logs
   - Error recovery and detailed error logging
   - Performance metrics logging (processing time, batch size)
3. Add retry and dead letter handling with audit logging:
   - Exponential backoff for failed publishes
   - Maximum retry attempts configuration
   - Dead letter queue for permanently failed events
   - Detailed retry attempt logging
   - Monitoring metrics for outbox processing
4. Implement idempotency with tracking logs:
   - Prevent duplicate event publishing
   - Use message IDs for deduplication
   - Handle RabbitMQ publisher confirms
   - Log idempotency check results
5. Add comprehensive monitoring and logging:
   - Process events counter with structured logs
   - Failed events counter and error categorization
   - Processing latency metrics and performance logs
   - Queue depth monitoring and alerting logs
   - Correlation ID propagation from original request

## Logging Requirements
- Structured JSON logs with consistent field naming
- Event processing lifecycle logging (start, progress, completion)
- Error logging with full context and stack traces
- Performance logging with timing metrics
- Business logic logging for audit purposes
- Correlation ID tracking from original HTTP request
- Log levels appropriate for production monitoring

## Acceptance Criteria
- Outbox processor handles events reliably with full audit trail
- Failed publishes are retried with backoff and logged appropriately
- No duplicate messages are sent with idempotency verification logs
- Graceful shutdown works properly with shutdown sequence logging
- Monitoring metrics are exposed and logged
- All operations include correlation IDs for tracing
- Integration tests verify outbox processing and logging behavior
```

#### Tarea 8: Order Processing Worker con Comprehensive Logging

**Prompt para GitHub Copilot:**

```
# Task: Order processing worker with business logic orchestration and detailed logging

## Context
Create the worker service that consumes order events and orchestrates the order processing workflow (stock verification, payment processing, email sending) with comprehensive logging for monitoring and debugging.

## Requirements
1. Create OrderProcessor in internal/worker/ with structured logging:
   - Consume messages from "orders.created" queue
   - Orchestrate order processing workflow with step-by-step logging
   - Handle each step with proper error handling and logging
   - Update order status throughout the process with audit logs
   - Maintain correlation IDs throughout processing
2. Implement processing steps with detailed logging:
   - Stock verification (mock service) with request/response logging
   - Payment processing (mock service) with PCI-compliant logging
   - Email notification (mock service) with delivery status logging
   - Order status updates with state transition logging
3. Add resilience patterns with monitoring logs:
   - Retry logic with exponential backoff and retry attempt logging
   - Circuit breaker for external service calls with state change logs
   - Timeout handling with timeout occurrence logging
   - Dead letter queue for failed orders with failure categorization
4. Implement idempotency with tracking:
   - Use Redis to track processed messages with operation logging
   - Handle duplicate message consumption with deduplication logs
   - Atomic status updates with transaction logging
5. Add comprehensive logging and monitoring:
   - Processing step logging with timing and context
   - Performance metrics with structured performance logs
   - Error tracking with categorization and severity
   - Business metrics (orders processed, success rate) logging
   - Customer impact logging for business intelligence

## Logging Requirements
- Structured JSON logs with business context
- Processing workflow logging (start, each step, completion)
- Error logging with categorization and customer impact
- Performance logging with step-by-step timing
- Business event logging for analytics and audit
- Security logging for payment processing (PCI-compliant)
- Correlation ID propagation from HTTP request through worker
- Log sampling for high-throughput scenarios

## Business Logic Logging Requirements
- Order lifecycle events (created, processing, completed, failed)
- Payment attempt logging (without sensitive data)
- Stock availability check results
- Email notification delivery status
- Customer communication audit trail
- Order value and revenue impact logging

## Acceptance Criteria
- Worker processes orders end-to-end with complete audit trail
- Each processing step is properly isolated and logged
- Failed orders are handled gracefully with detailed failure analysis
- Idempotency prevents duplicate processing with verification logs
- Monitoring provides visibility into processing with business context
- All logs maintain correlation IDs for end-to-end tracing
- PCI compliance maintained in payment-related logging
- Integration tests verify complete workflow and logging behavior
```

#### Tarea 9: Mock External Services

**Prompt para GitHub Copilot:**

```
# Task: Mock external services for testing and demonstration

## Context
Create mock implementations of external services (stock, payment, email) to demonstrate the complete order processing workflow.

## Requirements
1. Create mock services in internal/service/:
   - StockService with configurable responses
   - PaymentService with success/failure scenarios
   - EmailService with delivery simulation
   - All services implement proper interfaces
2. Implement realistic behavior:
   - Configurable delays to simulate network calls
   - Configurable failure rates
   - Different response scenarios (success, timeout, error)
   - Proper error types and messages
3. Add configuration options:
   - Enable/disable specific services
   - Configure response times and failure rates
   - Set up different test scenarios
   - Environment-specific configurations
4. Implement proper logging:
   - Log all service calls
   - Track success/failure rates
   - Monitor response times
   - Business logic logging
5. Add health checks:
   - Service availability checks
   - Dependency health reporting
   - Circuit breaker status

## Acceptance Criteria
- Mock services behave realistically
- Different scenarios can be configured
- Proper error handling and logging
- Health checks work correctly
- Services can be disabled for testing
- Integration tests use mock services
```

### Sprint 4: Reliability y Monitoring

**Objetivo:** Agregar características de confiabilidad, monitoreo y observabilidad.

#### Tarea 10: Idempotency y Caching con Redis

**Prompt para GitHub Copilot:**

```
# Task: Idempotency implementation using Redis for request deduplication

## Context
Implement idempotency for API requests and worker processing using Redis to prevent duplicate operations.

## Requirements
1. Create idempotency middleware for HTTP API:
   - Extract idempotency key from headers
   - Check Redis cache for existing responses
   - Store response in Redis with TTL
   - Handle concurrent requests with locking
2. Implement worker idempotency:
   - Track processed messages in Redis
   - Use message ID or content hash as key
   - Prevent duplicate order processing
   - Clean up old idempotency records
3. Create Redis service wrapper:
   - Connection management with retry logic
   - Proper error handling
   - Health check implementation
   - Metrics collection
4. Add idempotency configuration:
   - Configurable TTL for idempotency keys
   - Key prefix configuration
   - Redis connection parameters
   - Fallback behavior when Redis is unavailable
5. Implement proper locking:
   - Distributed locks for critical operations
   - Lock timeout and renewal
   - Deadlock prevention
   - Lock metrics

## Acceptance Criteria
- Duplicate API requests return cached responses
- Worker doesn't process duplicate messages
- Redis connection is properly managed
- Idempotency works under high concurrency
- Fallback behavior handles Redis failures
- Comprehensive tests verify idempotency
```

#### Tarea 11: Health Checks y Metrics

**Prompt para GitHub Copilot:**

```
# Task: Comprehensive health checks and Prometheus metrics

## Context
Implement health checks for all system components and expose Prometheus metrics for monitoring and alerting.

## Requirements
1. Create health check system:
   - Database health check with connection testing
   - RabbitMQ health check with queue status
   - Redis health check with ping/pong
   - External service health checks
   - Composite health check endpoint
2. Implement Prometheus metrics:
   - HTTP request metrics (duration, count, status codes)
   - Database operation metrics
   - Message queue metrics (published, consumed, failed)
   - Order processing metrics (created, processed, failed)
   - Business metrics (revenue, order count, processing time)
3. Create metrics middleware:
   - HTTP request instrumentation
   - Database operation instrumentation
   - Message processing instrumentation
   - Custom business metrics
4. Add alerting-ready metrics:
   - Error rate percentages
   - Response time percentiles
   - Queue depth and processing lag
   - System resource utilization
5. Implement proper labels:
   - Environment labels
   - Service instance labels
   - Operation type labels
   - Status code labels

## Acceptance Criteria
- Health checks accurately report component status
- All critical operations are instrumented
- Metrics follow Prometheus naming conventions
- Dashboards can be built from exposed metrics
- Alerts can be configured on key metrics
- Health check endpoint responds correctly
```

#### Tarea 12: Error Handling y Circuit Breaker

**Prompt para GitHub Copilot:**

```
# Task: Advanced error handling and circuit breaker pattern

## Context
Implement comprehensive error handling and circuit breaker pattern to improve system resilience when external services fail.

## Requirements
1. Create circuit breaker implementation:
   - Monitor external service call failures
   - Open circuit after threshold failures
   - Half-open state for recovery testing
   - Configurable thresholds and timeouts
2. Implement retry mechanisms:
   - Exponential backoff with jitter
   - Maximum retry limits
   - Retry only on retryable errors
   - Circuit breaker integration
3. Create comprehensive error handling:
   - Structured error types with error codes
   - Error context preservation
   - Proper error logging with stack traces
   - Error metrics and monitoring
4. Add timeout handling:
   - Context-based timeouts for all operations
   - Graceful timeout handling
   - Timeout metrics
   - Cascading timeout prevention
5. Implement fallback mechanisms:
   - Fallback responses for degraded services
   - Graceful degradation strategies
   - Alternative processing paths
   - User-friendly error messages

## Acceptance Criteria
- Circuit breaker prevents cascade failures
- Retries work with proper backoff
- All errors are properly categorized and logged
- Timeouts are handled gracefully
- Fallback mechanisms provide degraded functionality
- Error metrics enable effective monitoring
```

### Sprint 5: Testing y Documentation

**Objetivo:** Completar testing comprehensivo y documentación del sistema.

#### Tarea 13: Testing Suite Completo

**Prompt para GitHub Copilot:**

```
# Task: Comprehensive testing suite with unit, integration, and end-to-end tests

## Context
Create a complete testing suite covering all aspects of the order processing system with proper test fixtures and data.

## Requirements
1. Create unit tests for all layers:
   - Domain entity tests with edge cases
   - Repository tests with test database
   - Service layer tests with mocks
   - Handler tests with HTTP test server
   - Worker tests with message simulation
2. Implement integration tests:
   - Database integration tests
   - RabbitMQ integration tests
   - Redis integration tests
   - API integration tests
   - End-to-end order processing tests
3. Create test utilities and fixtures:
   - Test data builders and factories
   - Database test helpers
   - Message queue test helpers
   - HTTP client test helpers
   - Mock service implementations
4. Add performance tests:
   - Load testing for API endpoints
   - Throughput testing for worker processing
   - Stress testing for message queues
   - Memory and CPU profiling tests
5. Implement test configuration:
   - Separate test configuration
   - Test database setup and teardown
   - Docker compose for test dependencies
   - CI/CD pipeline integration

## Acceptance Criteria
- All code has >80% test coverage
- Tests run reliably in CI/CD pipeline
- Integration tests use real dependencies
- Performance tests establish baselines
- Test suite completes in reasonable time
- All tests are properly documented
```

#### Tarea 14: Docker Configuration y Deployment

**Prompt para GitHub Copilot:**

```
# Task: Docker containerization and deployment configuration

## Context
Create Docker configuration for all services and deployment orchestration using Docker Compose.

## Requirements
1. Create Dockerfiles:
   - Multi-stage Dockerfile for API service
   - Multi-stage Dockerfile for Worker service
   - Optimized image sizes with Alpine Linux
   - Proper security practices (non-root user)
   - Health check instructions
2. Create Docker Compose configuration:
   - Complete stack with all dependencies
   - PostgreSQL with persistent volumes
   - RabbitMQ with management interface
   - Redis with persistence
   - Service networking and dependencies
3. Add development configuration:
   - Development overrides
   - Live reload for development
   - Debug port exposure
   - Log volume mounts
4. Create production configuration:
   - Resource limits and reservations
   - Restart policies
   - Environment variable management
   - Secret management
   - Network security
5. Add deployment scripts:
   - Build and push scripts
   - Deployment automation
   - Health check verification
   - Rolling update procedures

## Acceptance Criteria
- Docker images build successfully
- All services start correctly with compose
- Services can communicate properly
- Health checks work in containers
- Production configuration is secure
- Deployment scripts automate the process
```

#### Tarea 15: Documentation, API Specification y Logging Guidelines

**Prompt para GitHub Copilot:**

```
# Task: Comprehensive documentation, API specification, and logging best practices

## Context
Create complete documentation for the order processing system including API documentation, architecture overview, operational guides, and logging best practices.

## Requirements
1. Create comprehensive API documentation:
   - Enhanced OpenAPI 3.0 specification with complete examples
   - Interactive Swagger UI with try-it functionality
   - Request/response examples for all scenarios
   - Error response documentation with troubleshooting
   - Authentication and security comprehensive docs
   - Rate limiting and quota documentation
2. Write architecture documentation:
   - System architecture overview with logging flow diagrams
   - Component interaction diagrams
   - Database schema documentation
   - Message flow documentation with event schemas
   - Deployment architecture with logging infrastructure
3. Create operational documentation:
   - Installation and setup guide with logging configuration
   - Configuration reference with logging parameters
   - Monitoring and alerting guide with log-based alerts
   - Troubleshooting guide with common log patterns
   - Performance tuning guide with logging optimization
4. Add development documentation:
   - Development environment setup with logging tools
   - Code organization and patterns with logging standards
   - Testing strategy and execution with log verification
   - Contributing guidelines with logging requirements
   - Code review checklist including logging best practices
5. Create logging documentation and guidelines:
   - Structured logging standards and field conventions
   - Log level usage guidelines (DEBUG, INFO, WARN, ERROR)
   - Correlation ID implementation and propagation
   - Log rotation and retention policies
   - Performance impact and sampling strategies
   - Security considerations for sensitive data logging
   - Integration with monitoring and alerting systems
6. Create user documentation:
   - API usage examples with error handling
   - Integration guide with logging recommendations
   - Best practices for API consumers
   - Rate limiting and quotas with usage monitoring
   - Error handling guidance with log correlation
7. Add operational runbooks:
   - Log analysis procedures for common issues
   - Performance monitoring using logs
   - Security incident response with log forensics
   - Capacity planning using log metrics
   - Disaster recovery procedures with logging verification

## Logging Documentation Requirements
- Field naming conventions and standardization
- Log format specifications (JSON schema)
- Correlation ID propagation examples
- Log aggregation and centralization guidelines
- Performance monitoring through logs
- Security and PCI compliance in logging
- Log-based alerting configuration examples
- Troubleshooting guide with log pattern analysis

## Enhanced API Documentation Requirements
- Interactive examples with actual request/response data
- Error scenario documentation with resolution steps
- Authentication flow documentation
- Webhook documentation for async notifications
- SDK and integration examples
- Postman collection generation
- Rate limiting behavior documentation

## Acceptance Criteria
- API documentation is complete, accurate, and interactive
- Architecture is clearly documented with logging considerations
- Operations team can deploy, maintain, and troubleshoot using logs
- Developers can easily contribute following logging standards
- Users can integrate successfully with proper error handling
- Documentation includes logging best practices and troubleshooting
- Log analysis procedures are clearly defined
- All documentation is kept up to date with automated generation
```

## Consideraciones de Implementación

### Patrones Utilizados

1. **Repository Pattern:** Para abstracción de datos
2. **Outbox Pattern:** Para consistencia eventual
3. **Circuit Breaker:** Para resiliencia
4. **CQRS Light:** Separación de lecturas/escrituras
5. **Event-Driven Architecture:** Comunicación asíncrona

### Características de Resiliencia

1. **Transacciones ACID:** Para consistencia de datos
2. **Idempotencia:** Prevención de duplicados
3. **Retry con Backoff:** Manejo de fallos temporales
4. **Dead Letter Queues:** Manejo de fallos permanentes
5. **Health Checks:** Monitoreo de dependencias

### Escalabilidad

1. **Servicios Stateless:** Escalado horizontal
2. **Message Queues:** Desacoplamiento temporal
3. **Caching:** Reducción de latencia
4. **Connection Pooling:** Optimización de recursos
5. **Metrics y Monitoring:** Visibilidad operacional
