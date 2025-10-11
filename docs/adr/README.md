# Architecture Decision Records (ADRs)

Este directorio contiene los registros de decisiones arquitectónicas (Architecture Decision Records - ADRs) del proyecto **E-commerce Async Resilient System**.

## ¿Qué son los ADRs?

Los ADRs son documentos que capturan decisiones arquitectónicas importantes junto con su contexto y consecuencias. Ayudan a entender **por qué** se tomaron ciertas decisiones técnicas en el proyecto.

## Formato de ADRs

Cada ADR sigue esta estructura:

```markdown
# [número]. [Título descriptivo]

- **Estado**: [Propuesto | Aceptado | Rechazado | Deprecado | Superseded]
- **Fecha**: YYYY-MM-DD
- **Decisores**: [Quién participó en la decisión]
- **Contexto**: [Problema o situación que requiere decisión]

## Decisión

[Qué se decidió hacer]

## Consecuencias

### Positivas

- [Beneficios de la decisión]

### Negativas

- [Trade-offs o desventajas]

## Alternativas Consideradas

1. **[Alternativa 1]**: [Por qué se descartó]
2. **[Alternativa 2]**: [Por qué se descartó]

## Referencias

- [Enlaces a documentación relevante]
```

## Índice de ADRs

### Arquitectura y Patrones

- [ADR-001](001-async-non-blocking-architecture.md) - Arquitectura Asíncrona No-Bloqueante
- [ADR-002](002-event-driven-outbox-pattern.md) - Event-Driven Architecture con Outbox Pattern
- [ADR-003](003-saga-pattern-orchestration.md) - Saga Pattern para Orquestación de Procesos
- [ADR-004](004-cqrs-pattern-implementation.md) - CQRS Pattern (Command Query Responsibility Segregation)

### Tecnologías Core

- [ADR-005](005-nestjs-framework-selection.md) - Selección de NestJS como Framework Backend
- [ADR-006](006-postgresql-database-choice.md) - PostgreSQL como Base de Datos Principal
- [ADR-007](007-typeorm-as-orm.md) - TypeORM como ORM
- [ADR-008](008-redis-bull-queue-system.md) - Redis + Bull para Sistema de Colas

### Resiliencia y Reliability

- [ADR-009](009-retry-pattern-exponential-backoff.md) - Retry Pattern con Exponential Backoff
- [ADR-010](010-circuit-breaker-pattern.md) - Circuit Breaker para Servicios Externos
- [ADR-011](011-idempotency-key-strategy.md) - Estrategia de Idempotencia
- [ADR-012](012-graceful-shutdown-mechanism.md) - Graceful Shutdown para Workers

### Seguridad y Autenticación

- [ADR-013](013-jwt-authentication-strategy.md) - JWT para Autenticación Stateless
- [ADR-014](014-password-hashing-bcrypt.md) - BCrypt para Hashing de Passwords
- [ADR-015](015-role-based-access-control.md) - RBAC (Role-Based Access Control)

### Observabilidad y Monitoring

- [ADR-016](016-structured-logging-winston.md) - Logging Estructurado con Winston
- [ADR-017](017-health-checks-terminus.md) - Health Checks con Terminus
- [ADR-018](018-prometheus-metrics-monitoring.md) - Prometheus para Métricas
- [ADR-019](019-bull-board-dashboard.md) - Bull Board para Monitoreo de Colas

### Testing y Quality

- [ADR-020](020-jest-testing-framework.md) - Jest como Framework de Testing
- [ADR-021](021-test-coverage-standards.md) - Estándares de Coverage (80%+)
- [ADR-022](022-e2e-testing-strategy.md) - Estrategia de Tests E2E

### DevOps y Deployment

- [ADR-023](023-docker-containerization.md) - Containerización con Docker
- [ADR-024](024-docker-compose-development.md) - Docker Compose para Desarrollo
- [ADR-025](025-multi-stage-docker-builds.md) - Multi-stage Docker Builds

## Proceso de Creación de ADRs

### 1. **Identificar una Decisión Arquitectónica**

- ¿Afecta la estructura del sistema?
- ¿Tiene impacto a largo plazo?
- ¿Es difícil de revertir?

### 2. **Documentar la Decisión**

- Usar el template de ADR
- Incluir contexto completo
- Listar alternativas consideradas

### 3. **Revisión y Aprobación**

- Revisar con equipo técnico
- Obtener feedback
- Aprobar y marcar como "Aceptado"

### 4. **Actualización**

- Si una decisión cambia, crear nuevo ADR
- Marcar ADR anterior como "Superseded"
- Referenciar el nuevo ADR

## Convenciones

### Numeración

- ADRs se numeran secuencialmente (001, 002, 003...)
- Números no se reutilizan aunque se rechace un ADR

### Estados Posibles

- **Propuesto**: En discusión, no implementado aún
- **Aceptado**: Aprobado e implementado
- **Rechazado**: Evaluado pero no aceptado
- **Deprecado**: Ya no se usa pero se mantiene historial
- **Superseded**: Reemplazado por otro ADR (indicar cuál)

### Naming

- Archivos: `NNN-titulo-descriptivo-kebab-case.md`
- Ejemplo: `001-async-non-blocking-architecture.md`

## Contribuyendo

Al crear un nuevo ADR:

1. Usar el próximo número disponible
2. Seguir el template de formato
3. Ser claro y conciso
4. Incluir contexto técnico y de negocio
5. Documentar trade-offs honestamente
6. Actualizar este README con el nuevo ADR

## Referencias

- [ADR GitHub Organization](https://adr.github.io/)
- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [Architecture Decision Records Best Practices](https://github.com/joelparkerhenderson/architecture-decision-record)

---

> 💡 **Nota**: Estos ADRs documentan decisiones **ya implementadas** en el proyecto. Representan el análisis y razonamiento que llevó a la arquitectura actual del sistema.
