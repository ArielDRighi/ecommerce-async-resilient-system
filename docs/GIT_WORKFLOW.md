# Git Workflow Configuration

Este repositorio sigue **GitFlow** para el desarrollo del Sistema Procesador de Órdenes Asíncrono.

## Estructura de Ramas

### Ramas Principales
- **`main`**: Rama de producción con releases estables
- **`develop`**: Rama de desarrollo con las últimas características

### Ramas de Características (Features)
- **Prefijo**: `feature/`
- **Ejemplo**: `feature/task-2-database-setup`
- **Flujo**: `develop` ← `feature/nombre` → merge a `develop`

### Ramas de Release
- **Prefijo**: `release/`
- **Ejemplo**: `release/v1.0.0`
- **Flujo**: `develop` ← `release/version` → merge a `main` y `develop`

### Ramas de Hotfix
- **Prefijo**: `hotfix/`
- **Ejemplo**: `hotfix/critical-bug-fix`
- **Flujo**: `main` ← `hotfix/nombre` → merge a `main` y `develop`

## Ramas Actuales del Proyecto

### Sprint 1: Fundación del Proyecto
- ✅ **`feature/task-1-project-foundation`**: Configuración inicial, logging, API base

### Sprint 2: Core API Implementation (Próximo)
- 🔄 **`feature/task-2-database-setup`**: PostgreSQL, migraciones, GORM
- 🔄 **`feature/task-3-rabbitmq-setup`**: Message queues, publishers, consumers

## Convenciones de Commits

### Formato
```
<tipo>(<scope>): <descripción>

<cuerpo opcional>

<footer opcional>
```

### Tipos de Commit
- **feat**: Nueva característica
- **fix**: Corrección de bug
- **docs**: Documentación
- **style**: Formato (sin cambios de código)
- **refactor**: Refactoring
- **test**: Agregar/modificar tests
- **chore**: Tareas de mantenimiento

### Ejemplos
```bash
feat(api): add order creation endpoint with validation
fix(logger): resolve correlation ID propagation issue
docs(readme): update installation instructions
test(handlers): add integration tests for order endpoints
```

## Flujo de Trabajo

### Para Nuevas Características
```bash
# 1. Actualizar develop
git checkout develop
git pull origin develop

# 2. Crear feature branch
git checkout -b feature/task-X-descripcion

# 3. Desarrollar y commitear
git add .
git commit -m "feat(scope): descripción"

# 4. Push y crear PR
git push origin feature/task-X-descripcion
# Crear Pull Request en GitHub: feature/task-X → develop
```

### Para Releases
```bash
# 1. Crear release branch desde develop
git checkout develop
git checkout -b release/v1.0.0

# 2. Preparar release (bumps, changelog, etc.)
git commit -m "chore(release): prepare v1.0.0"

# 3. Merge a main y develop
git checkout main
git merge release/v1.0.0
git tag v1.0.0
git checkout develop
git merge release/v1.0.0
```

## Estado Actual

### Rama Activa
- **`feature/task-1-project-foundation`**

### Próximos Pasos
1. Merge de `feature/task-1-project-foundation` → `develop`
2. Crear `feature/task-2-database-setup` desde `develop`
3. Continuar con implementación de base de datos

### Repositorio Remoto
- **GitHub**: https://github.com/ArielDRighi/ecommerce-async-resilient-system
- **Clone URL**: `git clone https://github.com/ArielDRighi/ecommerce-async-resilient-system.git`

## Comandos Útiles

```bash
# Ver todas las ramas
git branch -a

# Ver estado actual
git status

# Ver log con gráfico
git log --oneline --graph --all

# Limpiar ramas locales ya mergeadas
git branch --merged | grep -v "\*\|main\|develop" | xargs -n 1 git branch -d
```