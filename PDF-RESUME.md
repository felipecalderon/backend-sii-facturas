El error en el navegador **"No se pudo descargar: Sin archivo"** se debía a la conjunción de dos factores:

---

### 1. Causa Principal: Error 500 en Tiempo de Ejecución en `dte-pdf-renderer.ts`

Antes de la corrección anterior, la plantilla intentaba acceder a `item.montoItem.toClpInteger()` e `item.cantidad.amount`:

- `item.montoItem` evaluaba a `undefined`, lanzando:
  ```text
  TypeError: Cannot read properties of undefined (reading 'toClpInteger')
  ```
- Este error ocurría dentro de `DtePdfRenderer.renderToBuffer()`.
- Al no ser una instancia de `FiscalValidationError`, el controlador arrojaba un HTTP 500 (`Internal Server Error`).
- Cuando Chrome o el navegador intentan descargar un archivo vía enlace o botón y reciben un código HTTP 4xx o 500 con JSON en lugar de un stream binario, cancelan la descarga y muestran exactamente: **"No se pudo descargar: Sin archivo"**.

**Estado:** Corregido previamente con `item.getMontoItemClp()` y `DtePdfRenderer.formatQuantity(item.cantidad)`.

---

### 2. Autenticación Multitenant vía Enlace Directo (`@TenantId()`)

Cuando se abre un enlace de descarga en una pestaña del navegador (`<a href="...">` o `window.open(...)`), el navegador **no envía cabeceras personalizadas** como `x-tenant-id`.

- El decorador [`@TenantId()`](file:///d:/programacion/backend-sii-facturas/src/infrastructure/http/decorators/tenant-id.decorator.ts) lanzaba `BadRequestException: El header x-tenant-id es obligatorio` (HTTP 400).
- **Corrección aplicada:** Se actualizó el decorador para aceptar `tenantId` tanto desde el header `x-tenant-id` como desde query params (`?tenantId=...` o `?tenant_id=...`).

---

### 3. Cabeceras HTTP de Descarga en el Controlador

En [`InvoicesController`](file:///d:/programacion/backend-sii-facturas/src/modules/dte/invoices.controller.ts#L455-L460):

- Se cambió `inline` por `attachment; filename="${result.filename}"` para asegurar que el navegador lo trate como descarga de archivo y asigne el nombre correcto (`dte-33-105.pdf`).
- Se agregó la cabecera explícita `Content-Length: ${result.pdfBuffer.length}` para que el navegador conozca el tamaño exacto del binario recibido.

---

### 4. Importación en `pdf417-barcode.service.ts`

Se actualizó la importación a la subruta nativa:

```typescript
import bwipjs from 'bwip-js/node';
```

Manteniendo el paso estructurado de opciones `{ bcid: 'pdf417', text: tedXml.trim(), eclevel, rowheight, scale, ... }` a través de la interfaz tipada `Pdf417BwipRenderOptions`.
