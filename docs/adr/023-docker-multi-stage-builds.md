# ADR-023: Docker Multi-Stage Builds

**Estado:** Aceptado  
**Fecha:** 2024-01-17  
**Autor:** Equipo de Desarrollo

---

## Contexto

Se necesitan **imágenes Docker optimizadas** para producción: tamaño pequeño, builds rápidos, seguridad.

---

## Decisión

Usar **Dockerfile multi-stage** con etapas separadas de build y producción:

```dockerfile
# Dockerfile
# Etapa 1: Dependencias
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Etapa 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Etapa 3: Producción
FROM node:20-alpine AS production
WORKDIR /app

# Copiar solo dependencias de producción
COPY --from=deps /app/node_modules ./node_modules
# Copiar app compilada
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

ENV NODE_ENV=production
USER node

CMD ["node", "dist/main.js"]
```

---

## Tamaño de Imágenes

**Antes (single-stage):** 1.2 GB  
**Después (multi-stage):** 180 MB  
**Reducción:** 85% más pequeña! 🚀

---

## Beneficios

✅ **Imágenes Pequeñas:** Solo deps de producción + código compilado  
✅ **Builds Rápidos:** Capas cacheadas, etapas paralelas  
✅ **Seguro:** Sin herramientas de build en imagen de producción  
✅ **Base Alpine:** Superficie de ataque mínima

---

**Estado:** ✅ **IMPLEMENTADO Y OPERACIONAL**  
**Archivos:** `Dockerfile`, `Dockerfile.dev`  
**Última Actualización:** 2024-01-17
