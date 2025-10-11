# ADR-025: CI/CD con Husky & lint-staged

**Estado:** Aceptado  
**Fecha:** 2024-01-17  
**Autor:** Equipo de Desarrollo

---

## Contexto

Se necesitan **checks automáticos de calidad** antes de commits: linting, formateo, tests.

---

## Decisión

Usar **Husky + lint-staged** para Git hooks:

**Configuración Husky:**

```json
// package.json
{
  "scripts": {
    "prepare": "husky install"
  },
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write", "jest --bail --findRelatedTests"]
  }
}
```

**Git Hooks:**

```bash
# .husky/pre-commit
npm run lint-staged

# .husky/pre-push
npm run test
npm run test:e2e
```

---

## Flujo de Trabajo

```
1. Desarrollador hace commit del código
   ↓
2. Hook pre-commit se ejecuta
   - ESLint arregla issues
   - Prettier formatea código
   - Jest testea archivos relacionados
   ↓
3. Si todos pasan → commit exitoso
   Si alguno falla → commit bloqueado
   ↓
4. Desarrollador hace push del código
   ↓
5. Hook pre-push se ejecuta
   - Suite completa de tests (unit + E2E)
   ↓
6. Si pasa → push exitoso
   Si falla → push bloqueado
```

---

## Beneficios

✅ **Quality Gate:** Ningún código malo llega al repo  
✅ **Rápido:** Solo testea archivos modificados  
✅ **Automático:** Cero intervención manual  
✅ **Consistente:** Mismos checks para todos los desarrolladores

---

## Pipeline CI/CD (Planeado)

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test:cov
      - run: npm run test:e2e
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: docker build -t app .
```

---

**Estado:** ✅ **IMPLEMENTADO** (Husky + lint-staged operacional)  
**Planeado:** Pipeline GitHub Actions CI/CD  
**Archivos:** `.husky/`, `package.json`  
**Última Actualización:** 2024-01-17
