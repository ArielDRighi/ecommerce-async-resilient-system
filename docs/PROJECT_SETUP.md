# 🚀 Project Setup Guide - E-commerce Async Resilient System

> **Versión**: 1.0.0  
> **Última actualización**: Octubre 2025  
> **Tiempo estimado de setup**: 15-20 minutos

## 📋 Tabla de Contenidos

- [Prerrequisitos](#prerrequisitos)
- [Instalación Rápida](#instalación-rápida)
- [Configuración Detallada](#configuración-detallada)
- [Variables de Entorno](#variables-de-entorno)
- [Base de Datos](#base-de-datos)
- [Verificación del Setup](#verificación-del-setup)
- [Troubleshooting](#troubleshooting)
- [Desarrollo](#desarrollo)

---

## 🔧 Prerrequisitos

### Software Requerido

| Software           | Versión Mínima | Versión Recomendada | Propósito                                |
| ------------------ | -------------- | ------------------- | ---------------------------------------- |
| **Node.js**        | 18.0.0         | 20.x LTS            | Runtime de JavaScript                    |
| **npm**            | 8.0.0          | 10.x                | Package manager                          |
| **Docker**         | 20.10+         | Latest              | Contenedores (opcional pero recomendado) |
| **Docker Compose** | 2.0+           | Latest              | Orquestación de contenedores             |
| **Git**            | 2.30+          | Latest              | Control de versiones                     |
| **PostgreSQL**     | 15+            | 15.x                | Base de datos (si no usas Docker)        |
| **Redis**          | 7.0+           | 7.x                 | Cache y colas (si no usas Docker)        |

### Herramientas Opcionales

- **VS Code** - Editor recomendado
- **Postman/Insomnia** - Testing de API
- **pgAdmin** - GUI para PostgreSQL
- **Redis Commander** - GUI para Redis

### Verificar Versiones Instaladas

```bash
# Node.js
node --version
# v20.x.x ✅

# npm
npm --version
# 10.x.x ✅

# Docker
docker --version
# Docker version 24.x.x ✅

# Docker Compose
docker-compose --version
# Docker Compose version 2.x.x ✅

# Git
git --version
# git version 2.x.x ✅
```

---

## ⚡ Instalación Rápida

### Opción 1: Con Docker (Recomendado) 🐳

**Ideal para**: Setup rápido sin instalar PostgreSQL/Redis localmente

```bash
# 1. Clonar repositorio
git clone https://github.com/ArielDRighi/ecommerce-async-resilient-system.git
cd ecommerce-async-resilient-system

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env si es necesario (valores por defecto funcionan con Docker)

# 4. Iniciar servicios con Docker
docker-compose up -d postgres redis

# 5. Ejecutar migraciones
npm run migration:run

# 6. (Opcional) Ejecutar seeds
npm run seed:run

# 7. Iniciar aplicación
npm run start:dev

# ✅ API disponible en http://localhost:3000
# ✅ Swagger docs en http://localhost:3000/api
# ✅ Bull Board en http://localhost:3000/admin/queues
```

### Opción 2: Sin Docker (Manual)

**Ideal para**: Desarrollo con servicios locales ya instalados

```bash
# 1. Clonar repositorio
git clone https://github.com/ArielDRighi/ecommerce-async-resilient-system.git
cd ecommerce-async-resilient-system

# 2. Instalar PostgreSQL 15+ y Redis 7.x localmente

# 3. Crear base de datos PostgreSQL
psql -U postgres
CREATE DATABASE ecommerce_async;
\q

# 4. Instalar dependencias del proyecto
npm install

# 5. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones locales

# 6. Ejecutar migraciones
npm run migration:run

# 7. (Opcional) Ejecutar seeds
npm run seed:run

# 8. Iniciar aplicación
npm run start:dev

# ✅ API disponible en http://localhost:3000
```

### Opción 3: Docker Compose Completo 🚀

**Ideal para**: Ambiente completamente aislado (incluye app en Docker)

```bash
# 1. Clonar y entrar al directorio
git clone https://github.com/ArielDRighi/ecommerce-async-resilient-system.git
cd ecommerce-async-resilient-system

# 2. Configurar .env
cp .env.example .env

# 3. Build y start de todos los servicios
docker-compose up -d

# 4. Ver logs
docker-compose logs -f app

# 5. Ejecutar migraciones (dentro del contenedor)
docker-compose exec app npm run migration:run

# 6. (Opcional) Seeds
docker-compose exec app npm run seed:run

# ✅ Todo corriendo en contenedores
```

---

## ⚙️ Configuración Detallada

### 1. **Clonar el Repositorio**

```bash
# HTTPS
git clone https://github.com/ArielDRighi/ecommerce-async-resilient-system.git

# SSH (si tienes configurado)
git clone git@github.com:ArielDRighi/ecommerce-async-resilient-system.git

# Entrar al directorio
cd ecommerce-async-resilient-system

# Verificar branch
git branch
# * develop ← Rama principal de desarrollo
```

### 2. **Instalar Dependencias**

```bash
# Instalar todas las dependencias
npm install

# Esto instalará:
# - Dependencies: 30+ packages (~150 MB)
#   - @nestjs/*, typeorm, bull, redis, pg, etc.
# - DevDependencies: 40+ packages
#   - @types/*, jest, eslint, prettier, etc.

# Verificar instalación
npm list --depth=0
```

### 3. **Configurar Docker Services**

#### docker-compose.yml incluye:

```yaml
services:
  postgres: # PostgreSQL 15-alpine
  redis: # Redis 7-alpine
  app: # NestJS app (development)
  pgadmin: # DB management GUI (opcional)
  redis-commander: # Redis GUI (opcional)
```

#### Comandos Docker útiles:

```bash
# Iniciar solo servicios core (PostgreSQL + Redis)
docker-compose up -d postgres redis

# Ver estado de servicios
docker-compose ps

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down

# Detener y limpiar volúmenes (⚠️ PIERDE DATOS)
docker-compose down -v

# Reiniciar un servicio específico
docker-compose restart postgres
```

#### Incluir herramientas GUI (opcional):

```bash
# Iniciar con pgAdmin y Redis Commander
docker-compose --profile tools up -d

# Acceder a pgAdmin: http://localhost:8080
# Email: admin@ecommerce.local
# Password: admin

# Acceder a Redis Commander: http://localhost:8081
```

---

## 🔐 Variables de Entorno

### Archivo .env.example

```env
# ===============================================
# APPLICATION SETTINGS
# ===============================================
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1

# ===============================================
# DATABASE CONFIGURATION
# ===============================================
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=ecommerce_async
DATABASE_USER=postgres
DATABASE_PASSWORD=password

# Connection pool settings
DATABASE_CONNECTION_POOL_MIN=5
DATABASE_CONNECTION_POOL_MAX=20
DATABASE_CONNECTION_TIMEOUT=30000

# TypeORM Settings
TYPEORM_SYNCHRONIZE=false
TYPEORM_LOGGING=false
TYPEORM_MIGRATIONS_RUN=false

# ===============================================
# REDIS CONFIGURATION
# ===============================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=ecommerce:

# ===============================================
# BULL QUEUE CONFIGURATION
# ===============================================
BULL_REDIS_DB=1
BULL_KEY_PREFIX=bull
BULL_DEFAULT_ATTEMPTS=3
BULL_REMOVE_ON_COMPLETE=100
BULL_REMOVE_ON_FAIL=50
BULL_RATE_LIMIT=true
BULL_RATE_LIMIT_MAX=100
BULL_RATE_LIMIT_DURATION=1000

# ===============================================
# JWT AUTHENTICATION
# ===============================================
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this
JWT_REFRESH_EXPIRES_IN=7d

# ===============================================
# ENCRYPTION
# ===============================================
ENCRYPTION_KEY=change-this-32-character-key!!
ENCRYPTION_IV=16-character-iv

# ===============================================
# LOGGING
# ===============================================
LOG_LEVEL=info
LOG_DIR=logs
LOG_MAX_FILES=14d
LOG_MAX_SIZE=20m
LOG_COLORIZE=true

# ===============================================
# SECURITY
# ===============================================
HELMET_ENABLED=true
CORS_ENABLED=true
CORS_ORIGIN=http://localhost:3001
RATE_LIMIT_TTL=60000
RATE_LIMIT_MAX=100

# ===============================================
# API DOCUMENTATION
# ===============================================
ENABLE_SWAGGER=true
SWAGGER_PATH=api

# ===============================================
# EXTERNAL SERVICES (Mock in development)
# ===============================================
PAYMENT_GATEWAY_URL=https://api.mockpayment.com
PAYMENT_GATEWAY_API_KEY=mock-key
PAYMENT_SUCCESS_RATE=80

EMAIL_PROVIDER_API_KEY=mock-email-key
EMAIL_FROM_ADDRESS=noreply@ecommerce.local
EMAIL_FROM_NAME=E-commerce System

# ===============================================
# MONITORING & HEALTH CHECKS
# ===============================================
ENABLE_PROMETHEUS=true
HEALTH_CHECK_TIMEOUT=5000
HEALTH_CHECK_MEMORY_HEAP_THRESHOLD=150
HEALTH_CHECK_MEMORY_RSS_THRESHOLD=150
HEALTH_CHECK_DISK_THRESHOLD=0.9
```

### Variables Críticas por Ambiente

| Variable              | Development   | Staging       | Production    |
| --------------------- | ------------- | ------------- | ------------- |
| `NODE_ENV`            | `development` | `staging`     | `production`  |
| `TYPEORM_SYNCHRONIZE` | `false`       | `false`       | `false` ⚠️    |
| `TYPEORM_LOGGING`     | `true`        | `false`       | `false`       |
| `JWT_SECRET`          | Mock OK       | Strong random | Strong random |
| `DATABASE_PASSWORD`   | Simple OK     | Strong        | Strong        |
| `HELMET_ENABLED`      | `false`       | `true`        | `true`        |
| `LOG_LEVEL`           | `debug`       | `info`        | `warn`        |
| `ENABLE_SWAGGER`      | `true`        | `true`        | `false` 🔒    |

### Generar Secrets Seguros

```bash
# JWT Secret (32 caracteres random)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Key (32 bytes = 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Encryption IV (16 bytes)
node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"
```

---

## 🗄️ Base de Datos

### Migraciones

```bash
# Ver estado de migraciones
npm run migration:show

# Ejecutar migraciones pendientes
npm run migration:run

# Revertir última migración
npm run migration:revert

# Generar nueva migración (después de cambiar entities)
npm run migration:generate -- --name MigrationName

# Crear migración vacía
npm run migration:create -- --name MigrationName
```

### Seeds (Datos Iniciales)

```bash
# Ejecutar seeds (crea datos de prueba)
npm run seed:run

# Seeds incluye:
# - 2 usuarios (admin + customer)
# - 4 categorías (Electronics, Clothing, Books, Home)
# - 10 productos de ejemplo
# - Inventario inicial
```

### Reset Completo de DB

```bash
# ⚠️ CUIDADO: Borra TODOS los datos

# Opción 1: Revertir y volver a migrar
npm run migration:revert  # Revertir todas
npm run migration:run     # Aplicar de nuevo
npm run seed:run         # Re-seed

# Opción 2: Script de reset (si existe)
npm run db:reset

# Opción 3: Docker (destruir y recrear)
docker-compose down -v
docker-compose up -d postgres redis
npm run migration:run
npm run seed:run
```

### Conectar a PostgreSQL

```bash
# Con Docker
docker-compose exec postgres psql -U postgres -d ecommerce_async

# Local
psql -U postgres -d ecommerce_async

# Comandos útiles en psql:
\dt                    # Listar tablas
\d users               # Describir tabla users
SELECT * FROM orders LIMIT 10;  # Query de ejemplo
\q                     # Salir
```

---

## ✅ Verificación del Setup

### 1. **Health Check**

```bash
# API debe estar corriendo
curl http://localhost:3000/api/v1/health

# Respuesta esperada:
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" },
    "storage": { "status": "up" }
  },
  "details": {...}
}
```

### 2. **Swagger UI**

```bash
# Abrir en navegador
open http://localhost:3000/api

# Deberías ver:
# - Documentación completa de API
# - Todos los endpoints organizados por módulos
# - Botón "Authorize" para JWT
```

### 3. **Bull Board (Queue Dashboard)**

```bash
# Abrir dashboard de colas
open http://localhost:3000/admin/queues

# Deberías ver:
# - 4 colas: order-processing, payment-processing, inventory-management, notification-sending
# - Estado de cada cola (waiting, active, completed, failed)
# - Jobs recientes
```

### 4. **Test de Endpoints**

```bash
# Crear usuario de prueba
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "Test",
    "lastName": "User"
  }'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'

# Guardar el access_token de la respuesta
export TOKEN="eyJhbGciOiJIUzI1..."

# Test endpoint protegido
curl http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer $TOKEN"
```

### 5. **Logs**

```bash
# Ver logs de la aplicación
tail -f logs/app-*.log

# Con Docker
docker-compose logs -f app

# Logs deberían mostrar:
# [NestApplication] Nest application successfully started
# [InstanceLoader] OrdersModule dependencies initialized
# [RoutesResolver] OrdersController {/api/v1/orders}
# [QueueService] Queue Service initialized
```

---

## 🐛 Troubleshooting

### Problema: Puerto 3000 ya en uso

```bash
# Encontrar proceso usando puerto 3000
lsof -ti:3000

# Matar proceso
kill -9 $(lsof -ti:3000)

# O cambiar puerto en .env
PORT=3001
```

### Problema: PostgreSQL no conecta

```bash
# Verificar que Docker container está corriendo
docker-compose ps postgres

# Ver logs de PostgreSQL
docker-compose logs postgres

# Verificar conexión directa
docker-compose exec postgres psql -U postgres -c "SELECT 1"

# Recrear contenedor
docker-compose down postgres
docker-compose up -d postgres
```

### Problema: Redis no conecta

```bash
# Verificar Redis container
docker-compose ps redis

# Test de conexión
docker-compose exec redis redis-cli ping
# PONG ✅

# Ver logs
docker-compose logs redis
```

### Problema: Migraciones fallan

```bash
# Ver estado de migraciones
npm run migration:show

# Si dice "pending migrations", ejecutar:
npm run migration:run

# Si falla con error de conexión, verificar DATABASE_* en .env

# Si falla con error de SQL, puede ser que la DB esté en mal estado
# Reset completo:
docker-compose down -v
docker-compose up -d postgres
npm run migration:run
```

### Problema: npm install falla

```bash
# Limpiar cache de npm
npm cache clean --force

# Borrar node_modules y package-lock.json
rm -rf node_modules package-lock.json

# Reinstalar
npm install

# Si sigue fallando, verificar versión de Node
node --version
# Debe ser >= 18.0.0
```

### Problema: TypeScript errors

```bash
# Verificar tipos
npm run type-check

# Rebuild
npm run build

# Si persiste, limpiar dist
rm -rf dist
npm run build
```

---

## 💻 Desarrollo

### Comandos Principales

```bash
# Desarrollo con hot reload
npm run start:dev

# Modo debug (permite attach de debugger)
npm run start:debug

# Build para producción
npm run build

# Correr build de producción
npm run start:prod

# Tests
npm run test          # Unit tests
npm run test:watch    # Watch mode
npm run test:cov      # Con coverage
npm run test:e2e      # End-to-end tests

# Linting y formato
npm run lint          # Ejecutar ESLint
npm run lint:fix      # Auto-fix issues
npm run format        # Formatear con Prettier
npm run type-check    # Verificar tipos TypeScript
```

### Estructura del Proyecto

```
ecommerce-async-resilient-system/
├── src/
│   ├── common/              # Código compartido
│   ├── config/              # Configuraciones
│   ├── database/            # Migraciones y seeds
│   ├── modules/             # Módulos de negocio
│   │   ├── auth/
│   │   ├── orders/
│   │   ├── products/
│   │   ├── inventory/
│   │   ├── payments/
│   │   ├── notifications/
│   │   └── events/
│   ├── queues/              # Bull processors
│   ├── health/              # Health checks
│   └── main.ts              # Entry point
├── test/                    # Tests E2E
├── docs/                    # Documentación
├── logs/                    # Logs (generados)
├── dist/                    # Build output (generado)
└── coverage/                # Coverage reports (generado)
```

### Hot Reload (Desarrollo)

El proyecto está configurado con hot reload automático:

```bash
npm run start:dev

# Al guardar cambios en archivos .ts:
# [Webpack] Compiling...
# [Webpack] Compiled successfully
# [NestApplication] Nest application successfully started
```

### Debugging en VS Code

Crear `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach NestJS",
      "port": 9229,
      "restart": true,
      "stopOnEntry": false,
      "protocol": "inspector"
    }
  ]
}
```

Luego:

1. `npm run start:debug`
2. F5 en VS Code para attach debugger
3. Colocar breakpoints en código

### Git Workflow

```bash
# Crear feature branch desde develop
git checkout develop
git pull origin develop
git checkout -b feature/mi-nueva-feature

# Hacer cambios y commits
git add .
git commit -m "feat: agregar nueva funcionalidad"

# Push y crear PR
git push origin feature/mi-nueva-feature

# Después de merge, actualizar develop
git checkout develop
git pull origin develop
```

---

## 📚 Siguientes Pasos

Después del setup, explora:

1. **[Architecture Documentation](ARCHITECTURE.md)** - Entender la arquitectura del sistema
2. **[API Documentation](API_DOCUMENTATION.md)** - Detalles de todos los endpoints
3. **[Database Design](DATABASE_DESIGN.md)** - Esquema de base de datos
4. **[ADRs](adr/README.md)** - Decisiones arquitectónicas

### Tutoriales Recomendados

- **Crear una orden**: Ver [Swagger UI](http://localhost:3000/api) → POST /orders
- **Monitorear procesamiento**: Ver [Bull Board](http://localhost:3000/admin/queues)
- **Testing con Postman**: Importar colección (si existe en `/docs`)

---

## 🆘 Soporte

### Recursos

- **Issues**: [GitHub Issues](https://github.com/ArielDRighi/ecommerce-async-resilient-system/issues)
- **Documentación**: Carpeta `/docs`
- **Logs**: Carpeta `/logs`

### Contacto

- **GitHub**: [@ArielDRighi](https://github.com/ArielDRighi)
- **Email**: ariel.righi@example.com

---

> ✅ **Setup Completo!** Si llegaste hasta aquí sin errores, tu entorno de desarrollo está listo. Happy coding! 🚀
