# ADR-024: Orquestación con Docker Compose

**Estado:** Aceptado  
**Fecha:** 2024-01-17  
**Autor:** Equipo de Desarrollo

---

## Contexto

Se necesita ejecutar **múltiples servicios** localmente: app, PostgreSQL, Redis, con networking y volumes apropiados.

---

## Decisión

Usar **Docker Compose** para desarrollo local y testing:

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Base de Datos PostgreSQL
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ecommerce
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready']
      interval: 10s
      timeout: 5s
      retries: 5

  # Cache Redis
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  # App NestJS
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ecommerce
      REDIS_HOST: redis
      REDIS_PORT: 6379
    volumes:
      - ./src:/app/src # Hot reload
      - ./test:/app/test
    ports:
      - '3000:3000'
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

volumes:
  postgres_data:
  redis_data:
```

---

## Comandos

```bash
# Iniciar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Detener servicios
docker-compose down

# Rebuild después de cambios
docker-compose up -d --build
```

---

## Beneficios

✅ **Un Solo Comando:** Iniciar todo el stack con `docker-compose up`  
✅ **Networking:** Servicios se auto-descubren vía DNS  
✅ **Persistencia:** Volumes para datos  
✅ **Health Checks:** Espera a DB antes de iniciar app

---

**Estado:** ✅ **IMPLEMENTADO Y OPERACIONAL**  
**Archivos:** `docker-compose.yml`, `docker-compose.dev.yml`  
**Última Actualización:** 2024-01-17
