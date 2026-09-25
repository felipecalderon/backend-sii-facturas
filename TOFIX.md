## 1. Solución al error de "Número de Inscripción / Resolución"

El error que experimentas al enviar en el ambiente de **Certificación / Set de Pruebas** ocurre por una regla estricta del SII:

- **En Certificación (`CERTIFICATION`):** El campo `NroResol` debe ser **`0`** y la fecha `FchResol` debe ser **`2014-08-22`** (o `1900-01-01` en ciertos sets). Si envías un número de resolución real (como `80` que aparece en el ejemplo de tu schema), la carátula del `EnvioDTE` es rechazada inmediatamente.
- **En Producción (`PRODUCTION`):** Utiliza el número de resolución real asignado por el SII al contribuyente.

**Recomendación:** Implementa en tu backend una lógica automática que fuerce `NroResol = 0` y `FchResol = "2014-08-22"` cuando el `environment` sea `CERTIFICATION`.

---

## 2. Endpoints y funcionalidades faltantes para Certificación y Operación

### Soporte de Referencias (`<Referencia>`)

Para aprobar el Set de Pruebas del SII te exigirán emitir **Notas de Crédito (Tipo 61)** y **Notas de Débito (Tipo 56)** para anular o corregir facturas. Tu `IssueInvoiceDto` actualmente no posee un arreglo de referencias.

Agrega al schema `IssueInvoiceDto`:

```yaml
referencias:
  type: array
  description: Lista de documentos referenciados (obligatorio para Notas de Crédito/Débito)
  items:
    type: object
    properties:
      nroLinRef:
        type: number
        example: 1
      tpoDocRef:
        type: string
        description: Código tipo DTE referenciado (ej. 33)
        example: '33'
      folioRef:
        type: number
        example: 105
      fchRef:
        type: string
        format: date
        example: '2026-09-01'
      codRef:
        type: number
        description: Código de razón de referencia (1=Anula, 2=Corrige texto, 3=Corrige montos)
        example: 1
      razonRef:
        type: string
        example: 'Anula Factura Electronica Nro 105'
```

### Representación Impresa (PDF con PDF417)

Durante la certificación, el SII evalúa la generación del PDF impreso y la correcta codificación del código PDF417 (timbre electrónico).

- **Endpoint sugerido:** `GET /invoices/{folio}/pdf` (devuelve el archivo `application/pdf`).

### Intercambio B2B y Acuse de Recibo

La normativa DTE exige recibir y responder los XML de proveedores, además de notificar al receptor:

- **Envío al Receptor:** Enviar el XML de la factura por email al correo de intercambio registrado por el cliente.
- **Recepción y Respuesta (RespuestaDTE):** Endpoint para procesar compras y generar los XML de respuesta técnica (`RespuestaDTE`) y comercial (`ReciboItem` / Acuse de Recibo).

---

## 3. Mejoras de diseño en la OpenAPI Spec

1. **Estandarización de fechas según XSD del SII:**

- En el SII, el nodo `FchEmis` y `FchResol` no aceptan marcas de tiempo ISO-8601 con zona horaria (`2026-09-07T12:00:00.000Z`). Deben ir estrictamente en formato `YYYY-MM-DD`. Ajusta el `format: date` en los DTOs de entrada.

2. **Totales en números enteros:**

- En Chile, el peso (CLP) no utiliza decimales para montos finales ni IVA. Asegúrate de que `montoNeto`, `montoIva` y `montoTotal` utilicen algoritmos de redondeo (`Math.round`) antes de armar el XML.

3. **Múltiples DTEs por sobre `EnvioDTE`:**

- El servicio de recepción del SII recibe un contenedor `EnvioDTE` con su propia carátula (`Caratula`) y firma. Tu arquitectura actual emite 1 DTE por petición `/invoices`, lo cual es correcto para API REST, pero internamente debes asegurar que cada petición construya el envoltorio `EnvioDTE` correspondiente.
