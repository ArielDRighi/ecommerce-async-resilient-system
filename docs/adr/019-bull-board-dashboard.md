# ADR-019: Dashboard Bull Board para Colas

**Estado:** Aceptado  
**Fecha:** 2024-01-17  
**Autor:** Equipo de Desarrollo  
**ADRs Relacionados:** ADR-008 (Sistema de Colas Bull), ADR-012 (Dead Letter Queue)

---

## Contexto

Se necesita un **dashboard visual** para monitorear colas Bull: ver jobs, inspeccionar fallos, reintentar manualmente, verificar DLQ (dead letter queue).

---

## Decisión

Usar **@bull-board/express** para monitoreo web de colas. La configuración está centralizada en `main.ts`:

```typescript
/**
 * Bull Board Setup
 * Ubicación: src/main.ts
 */
async function bootstrap() {
  // ... código anterior ...

  try {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/api/v1/admin/queues');

    // Obtener instancias de colas desde la app
    const orderQueue = app.get<Queue>('BullQueue_order-processing');
    const paymentQueue = app.get<Queue>('BullQueue_payment-processing');
    const inventoryQueue = app.get<Queue>('BullQueue_inventory-management');
    const notificationQueue = app.get<Queue>('BullQueue_notification-sending');

    createBullBoard({
      queues: [
        new BullAdapter(orderQueue),
        new BullAdapter(paymentQueue),
        new BullAdapter(inventoryQueue),
        new BullAdapter(notificationQueue),
      ],
      serverAdapter,
    });

    // Montar Bull Board antes de establecer prefijo global
    app.use('/api/v1/admin/queues', serverAdapter.getRouter());
    logger.log(`📊 Bull Board dashboard disponible en: http://localhost:${port}/api/v1/admin/queues`);
  } catch (error) {
    logger.warn('⚠️  No se pudo configurar Bull Board dashboard:', (error as Error).message);
  }
}
```

---

## Características del Dashboard

**Acceso:** `http://localhost:3000/api/v1/admin/queues`

**Vistas:**

1. **Overview:** Todas las colas, contadores de jobs (activos, esperando, completados, fallidos)
2. **Detalles de Cola:** Cola específica, lista paginada de jobs
3. **Inspector de Jobs:** Ver datos del job, stack de error, logs
4. **Acciones:**
   - Reintentar jobs fallidos (individual o masivo)
   - Eliminar jobs
   - Promover jobs (mover al frente de la cola)
   - Ver timeline del job (encolado → activo → completado/fallido)

**Actualizaciones en Tiempo Real:** Auto-refresh de contadores de jobs, cambios de estado

---

## Monitoreo de Colas

```
┌─────────────────────────────────────────────────────────┐
│ Bull Board Dashboard                                    │
├─────────────────────────────────────────────────────────┤
│ order-processing                                        │
│   ● Active: 3   ● Waiting: 45   ✓ Completed: 1,234     │
│   ✗ Failed: 5   (View DLQ)                              │
├─────────────────────────────────────────────────────────┤
│ payment-processing                                      │
│   ● Active: 1   ● Waiting: 12   ✓ Completed: 456       │
│   ✗ Failed: 2   (View DLQ)                              │
├─────────────────────────────────────────────────────────┤
│ inventory-management                                    │
│   ● Active: 0   ● Waiting: 3    ✓ Completed: 789       │
│   ✗ Failed: 0                                           │
├─────────────────────────────────────────────────────────┤
│ notification-sending                                    │
│   ● Active: 2   ● Waiting: 34   ✓ Completed: 2,345     │
│   ✗ Failed: 1   (View DLQ)                              │
└─────────────────────────────────────────────────────────┘
```

---

## Gestión de DLQ (Dead Letter Queue)

**Vista de Jobs Fallidos:**

```
Job ID: 12345
Status: Failed
Attempts: 3/3
Error: ETIMEDOUT: Payment gateway timeout
Stack Trace: [View Full]

Job Data:
{
  "orderId": "order-123",
  "paymentMethod": "stripe",
  "amount": 99.99
}

Actions:
[Retry Job]  [Delete Job]  [View Logs]
```

**Acciones Masivas:**

- Reintentar todos los jobs fallidos en la cola
- Eliminar todos los jobs fallidos más antiguos de 30 días
- Exportar jobs fallidos como JSON

---

## Beneficios

✅ **Monitoreo Visual:** Ver salud de colas de un vistazo  
✅ **Inspección de DLQ:** Debuggear jobs fallidos con contexto completo  
✅ **Recuperación Manual:** Reintentar jobs sin redesplegar código  
✅ **Debugging:** Ver datos de job, errores, stack traces  
✅ **Configuración Cero:** Bull Board auto-descubre colas  
✅ **Listo para Producción:** Usado en producción por muchas empresas

---

## Casos de Uso

**1. Recuperación Post-Incidente**

```
Gateway de pagos estuvo caído por 2 horas
→ 150 payment jobs movidos a DLQ
→ Gateway recuperado
→ Bull Board: Seleccionar todos los pagos fallidos → Retry
→ Todos los 150 jobs procesados exitosamente
```

**2. Debugging de Bug en Producción**

```
Procesamiento de órdenes fallando con "Cannot read property 'x' of undefined"
→ Bull Board: Ver job de orden fallido
→ Inspeccionar datos del job
→ Notar: dirección de envío es null (bug de validación)
→ Arreglar código, redesplegar, reintentar jobs
```

**3. Monitoreo de Salud de Colas**

```
Bull Board muestra: order-processing tiene 1,200 jobs esperando (inusual)
→ Verificar circuit breaker de pagos: OPEN (API de Stripe caída)
→ Esperar recuperación de Stripe
→ Circuit breaker se cierra, jobs se procesan automáticamente
```

---

## Consideraciones de Seguridad

**Actual:** Sin autenticación (solo desarrollo)

**Recomendación para Producción:**

- Agregar autenticación JWT + guard de roles ADMIN
- Whitelist de IPs
- Acceso vía VPN
- Servicio admin separado

---

**Estado:** ✅ **IMPLEMENTADO Y OPERACIONAL**  
**URL:** `http://localhost:3000/api/v1/admin/queues`  
**Colas Monitoreadas:** 4 (order-processing, payment-processing, inventory-management, notification-sending)  
**Ubicación:** `src/main.ts` (líneas 47-75)  
**Última Actualización:** 2024-01-17
