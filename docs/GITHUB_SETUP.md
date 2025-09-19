# GitHub Repository Setup

## Configuración Inicial

```bash
# Agregar remote origin
git remote add origin https://github.com/ArielDRighi/ecommerce-async-resilient-system.git

# Verificar remotes
git remote -v

# Push inicial de todas las ramas
git push -u origin main
git push -u origin develop
git push -u origin feature/task-1-project-foundation
```

## Configuración de Protección de Ramas

### En GitHub Settings → Branches

#### Protección para `main`:
- ✅ Require a pull request before merging
- ✅ Require approvals (1)
- ✅ Dismiss stale PR approvals when new commits are pushed
- ✅ Require review from code owners
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- ✅ Include administrators

#### Protección para `develop`:
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging

## Issues y Project Board

### Labels Sugeridos
- `bug` (🐛) - Para bugs
- `enhancement` (✨) - Para mejoras
- `documentation` (📚) - Para documentación
- `task-1` (🏗️) - Foundation Setup
- `task-2` (🗃️) - Database Setup
- `task-3` (🐰) - RabbitMQ Setup
- `task-4` (⚡) - API Implementation
- `task-5` (👷) - Worker Implementation
- `task-6` (🧪) - Testing
- `task-7` (🔧) - Observability
- `priority-high` (🔴) - Alta prioridad
- `priority-medium` (🟡) - Media prioridad
- `priority-low` (🟢) - Baja prioridad

### Project Board Structure
```
📋 Backlog
├── Task 1: Project Foundation ✅
├── Task 2: Database Setup 🔄
├── Task 3: RabbitMQ Setup 📋
├── Task 4: API Implementation 📋
├── Task 5: Worker Implementation 📋
├── Task 6: Testing Strategy 📋
└── Task 7: Observability 📋

🏗️ In Progress
├── [Empty] - Ready for Task 2

✅ Done
└── Task 1: Project Foundation
```

## Templates

### Pull Request Template
```markdown
## Descripción
Breve descripción de los cambios realizados.

## Tipo de Cambio
- [ ] Bug fix (cambio que corrige un issue)
- [ ] Nueva característica (cambio que agrega funcionalidad)
- [ ] Breaking change (fix o feature que causa cambios en funcionalidad existente)
- [ ] Documentación

## Testing
- [ ] Tests unitarios agregados/actualizados
- [ ] Tests de integración agregados/actualizados
- [ ] Tests manuales realizados

## Checklist
- [ ] Mi código sigue las convenciones del proyecto
- [ ] He realizado una auto-revisión de mi código
- [ ] He comentado mi código donde es necesario
- [ ] He actualizado la documentación correspondiente
- [ ] Mis cambios no generan nuevos warnings
- [ ] He agregado tests que prueban mi fix/feature
- [ ] Tests unitarios nuevos y existentes pasan localmente

## Issues Relacionados
Fixes #[issue_number]
```

### Issue Template (Bug)
```markdown
**Descripción del Bug**
Una descripción clara y concisa del bug.

**Para Reproducir**
Pasos para reproducir el comportamiento:
1. Ir a '...'
2. Hacer click en '....'
3. Scrollear hasta '....'
4. Ver error

**Comportamiento Esperado**
Una descripción clara de lo que esperabas que ocurriera.

**Screenshots**
Si aplica, agregar screenshots para ayudar a explicar el problema.

**Entorno:**
- OS: [e.g. Windows, macOS, Linux]
- Versión de Go: [e.g. 1.21]
- Rama: [e.g. develop, feature/xxx]

**Contexto Adicional**
Agregar cualquier otro contexto sobre el problema aquí.
```

## GitHub Actions (CI/CD)

Configuración sugerida para `.github/workflows/`:

### `ci.yml` - Continuous Integration
```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
      
      rabbitmq:
        image: rabbitmq:3-management
        options: >-
          --health-cmd "rabbitmq-diagnostics -q ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5672:5672
          - 15672:15672

    steps:
    - uses: actions/checkout@v4
    
    - name: Set up Go
      uses: actions/setup-go@v4
      with:
        go-version: '1.21'
    
    - name: Install dependencies
      run: go mod download
    
    - name: Run tests
      run: make test
      
    - name: Run linting
      run: make lint
      
    - name: Build application
      run: make build
```

## Comandos de Setup Inicial

```bash
# 1. Clonar el repositorio (para colaboradores)
git clone https://github.com/ArielDRighi/ecommerce-async-resilient-system.git
cd ecommerce-async-resilient-system

# 2. Configurar Git Flow (opcional, manual)
git config --local user.name "Tu Nombre"
git config --local user.email "tu@email.com"

# 3. Instalar dependencias
go mod download

# 4. Configurar environment
cp config.yaml.example config.yaml
# Editar config.yaml con tus configuraciones locales

# 5. Ejecutar tests
make test

# 6. Iniciar desarrollo
make dev
```