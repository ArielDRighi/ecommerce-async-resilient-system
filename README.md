# Order Processor - Asynchronous & Resilient E-commerce System

[![Go Version](https://img.shields.io/badge/Go-1.21+-blue.svg)](https://golang.org)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![API Documentation](https://img.shields.io/badge/API-Swagger-green.svg)](http://localhost:8080/swagger/index.html)

A comprehensive demonstration of building resilient, asynchronous order processing systems using Go. This project showcases industry best practices for handling high-volume e-commerce transactions with reliability, scalability, and comprehensive observability.

## 🎯 Key Concepts Demonstrated

- **Asynchronous Processing**: Orders are accepted immediately and processed in the background
- **Resilience Patterns**: Circuit breakers, retries, timeouts, and graceful degradation
- **Event-Driven Architecture**: RabbitMQ-based messaging with dead letter queues
- **Outbox Pattern**: Ensures data consistency between database and message broker
- **Idempotency**: Prevents duplicate processing with Redis-based deduplication
- **Comprehensive Logging**: Structured JSON logging with correlation IDs and performance metrics
- **API Documentation**: Auto-generated OpenAPI/Swagger documentation

## 🏗️ Architecture Overview

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

## 🚀 Quick Start

### Prerequisites

- Go 1.21 or higher
- Docker and Docker Compose
- Make (optional, for using Makefile commands)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/username/order-processor.git
   cd order-processor
   ```

2. **Install dependencies**

   ```bash
   make deps
   # or
   go mod download
   ```

3. **Start infrastructure services**

   ```bash
   docker-compose -f docker/docker-compose.yml up -d postgres redis rabbitmq
   ```

4. **Run database migrations** (coming in Sprint 2)

   ```bash
   make migrate-up
   ```

5. **Start the services**

   ```bash
   # Terminal 1: Start API service
   make run-api

   # Terminal 2: Start Worker service
   make run-worker
   ```

### Alternative: Development Mode

```bash
make dev  # Starts both services with development configuration
```

## 📚 API Documentation

Once the API service is running, access the interactive Swagger UI at:

- **Local**: http://localhost:8080/swagger/index.html
- **Health Check**: http://localhost:8080/health

### Key Endpoints

- `POST /api/v1/orders` - Create a new order (returns 202 Accepted)
- `GET /api/v1/orders/{id}` - Get order details
- `GET /api/v1/orders` - List orders with pagination
- `GET /health` - Health check with dependency status

## 🔧 Configuration

The application uses a hierarchical configuration system with the following precedence:

1. Environment variables (highest priority)
2. Configuration files
3. Default values (lowest priority)

### Environment Variables

All configuration can be overridden using environment variables with the `ORDER_` prefix:

```bash
export ORDER_SERVER_PORT=8080
export ORDER_DATABASE_HOST=localhost
export ORDER_RABBITMQ_HOST=localhost
export ORDER_LOGGER_LEVEL=debug
export ORDER_LOGGER_ENVIRONMENT=development
```

### Configuration Files

- `config.yaml` - Production configuration
- `config.dev.yaml` - Development overrides

## 🏃‍♂️ Development

### Available Make Commands

```bash
make help                # Show all available commands
make build              # Build all binaries
make test               # Run all tests
make docs-generate      # Generate API documentation
make format             # Format code
make lint               # Run linting
make clean              # Clean build artifacts
make logs-clean         # Clean rotated logs
```

### Project Structure

```
order-processor/
├── cmd/                    # Entry points
│   ├── api/               # API service main
│   └── worker/            # Worker service main
├── internal/              # Private application code
│   ├── config/           # Configuration management
│   ├── logger/           # Structured logging
│   ├── domain/           # Business logic
│   ├── repository/       # Data access layer
│   ├── service/          # Business services
│   ├── handler/          # HTTP handlers
│   ├── messaging/        # Message queue handling
│   └── worker/           # Background processing
├── pkg/                   # Public libraries
├── docs/                  # Documentation
├── logs/                  # Log files
├── migrations/           # Database migrations
├── tests/                # Test files
└── docker/               # Docker configurations
```

## 🔍 Logging & Monitoring

### Structured Logging

The application uses Zap for high-performance structured logging with:

- **Correlation IDs**: Track requests across services
- **JSON format**: For production log aggregation
- **Console format**: Human-readable for development
- **Log rotation**: Automatic cleanup with Lumberjack
- **Performance metrics**: Request timing and throughput

### Log Levels

- `DEBUG`: Detailed debugging information
- `INFO`: General operational information
- `WARN`: Warning conditions that should be addressed
- `ERROR`: Error conditions that need immediate attention

### Sample Log Output

```json
{
  "timestamp": "2023-09-19T10:30:00Z",
  "level": "info",
  "message": "Request completed successfully",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "path": "/api/v1/orders",
  "status_code": 202,
  "duration": "45ms",
  "client_ip": "192.168.1.100"
}
```

## 🧪 Testing

### Running Tests

```bash
# All tests
make test

# Unit tests only
make test-unit

# Integration tests only
make test-integration

# With coverage
make coverage
```

### Test Structure

- `tests/unit/` - Unit tests for individual components
- `tests/integration/` - Integration tests with external dependencies
- Coverage reports generated in `coverage.html`

## 🐳 Docker Deployment

### Build Images

```bash
make docker-build
```

### Run with Docker Compose

```bash
docker-compose -f docker/docker-compose.yml up
```

This starts:

- PostgreSQL database
- Redis cache
- RabbitMQ message broker
- API service
- Worker service

## 📈 Performance & Scalability

### Design Principles

- **Stateless services**: Horizontal scaling capability
- **Connection pooling**: Efficient resource utilization
- **Circuit breakers**: Fail fast and recover gracefully
- **Idempotency**: Safe retry mechanisms
- **Async processing**: Non-blocking user experience

### Performance Features

- Request/response caching with Redis
- Database connection pooling with GORM
- Message batching in RabbitMQ
- Log sampling for high-throughput environments
- Correlation ID propagation for distributed tracing

## 🔒 Security Considerations

### Implemented Security Features

- Request validation and sanitization
- SQL injection prevention (GORM)
- Correlation ID tracking for audit trails
- Sensitive data handling in logs
- Health check authentication (future)

### Security Scanning

```bash
make security-scan
```

## 🚧 Roadmap

### Sprint 2: Core Implementation

- [ ] Database schema and migrations
- [ ] Order domain entities
- [ ] Repository pattern implementation
- [ ] Complete API handlers

### Sprint 3: Async Processing

- [ ] RabbitMQ integration
- [ ] Outbox pattern processor
- [ ] Worker service implementation
- [ ] External service mocks

### Sprint 4: Reliability

- [ ] Circuit breaker implementation
- [ ] Redis idempotency
- [ ] Health checks
- [ ] Metrics collection

### Sprint 5: Testing & Documentation

- [ ] Comprehensive test suite
- [ ] Performance testing
- [ ] Complete documentation
- [ ] Deployment guides

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Follow the coding standards (run `make format lint`)
4. Write tests for new functionality
5. Update documentation as needed
6. Submit a pull request

### Code Standards

- Follow Go best practices and idioms
- Use structured logging with correlation IDs
- Include comprehensive error handling
- Write meaningful tests with good coverage
- Document public APIs with clear examples

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- **Documentation**: Check the `/docs` directory
- **API Reference**: http://localhost:8080/swagger/index.html
- **Issues**: Use GitHub Issues for bug reports and feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas

## 🙏 Acknowledgments

This project demonstrates enterprise-grade Go development patterns and is designed for educational purposes to showcase:

- Modern Go application architecture
- Microservices design patterns
- Observability and monitoring best practices
- Resilience and reliability patterns
- Comprehensive testing strategies

---

Built with ❤️ using Go and industry best practices.
