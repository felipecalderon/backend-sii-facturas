# Motor de Facturación Electrónica SII — Objetivos y Roadmap

## 1. Propósito

Construir un motor backend en NestJS para la emisión, timbraje, firma, transmisión y consulta de Documentos Tributarios Electrónicos (DTE) ante el Servicio de Impuestos Internos (SII) de Chile.

El sistema es **multitenant nativo**: cada contribuyente opera de manera aislada mediante `tenantId`, incluyendo certificados, CAF, folios, configuración y documentos.

---

## 2. Alcance del MVP Técnico

El primer objetivo verificable es emitir un DTE válido contra el ambiente de certificación del SII.

### 2.1. Incluido

- **Multitenancy:** todas las operaciones requieren `tenantId`.
- **DTE:** Factura Electrónica (`TipoDTE 33`).
- **Ambiente:** certificación SII (Maullin / Palena).
- **Folios:** importación de CAF y asignación atómica por tenant.
- **TED:** generación y firma según especificación SII.
- **XML:** generación y validación contra XSD oficiales.
- **Firma digital:** XMLDSig del DTE y `EnvioDTE`.
- **Autenticación SII:** semilla → firma → token.
- **Transmisión:** envío de `EnvioDTE` y obtención de `TrackID`.
- **Consulta:** consulta del estado del envío.
- **Persistencia:** DTE persistido antes de su transmisión.
- **Idempotencia:** control mediante `(tenantId, idempotencyKey)`.

### 2.2. Fuera del MVP

- Otros tipos de DTE.
- Recepción y procesamiento de DTE de proveedores.
- Portal administrativo.
- Facturación masiva.
- Integraciones con ERPs externos.

---

## 3. Principios Fiscales No Negociables

1. **Modelo canónico:** el DTE es una entidad de dominio; el XML es una representación.

2. **Precisión monetaria:** prohibido utilizar `number` directamente para cálculos fiscales. El dinero, cantidades, impuestos y redondeos deben utilizar tipos o Value Objects con precisión controlada.

3. **Emisión ≠ transmisión:** crear, timbrar, firmar y persistir un DTE son operaciones independientes de su transmisión al SII.

4. **Persistencia antes de transmisión:** ningún DTE firmado se transmite sin estar previamente persistido.

5. **Asignación atómica de folios:** la reserva de folios debe ser segura frente a concurrencia por `(tenantId, tipoDte)`.

6. **Separación criptográfica:**

   - **TED:** firmado con la clave privada correspondiente al CAF.
   - **DTE / EnvioDTE:** firmados mediante XMLDSig con el certificado digital autorizado.

---

## 4. Máquina de Estados

```text
[DRAFT]
   ↓
[FOLIO_ASSIGNED]
   ↓
[BUILT]
   ↓
[STAMPED]
   ↓
[SIGNED]
   ↓
[PERSISTED]
   ↓
[SUBMITTED]
   ↓
[ACCEPTED] | [REJECTED] | [OBSERVED] | [UNKNOWN]
```

### Regla de incertidumbre

Un timeout, error de conexión o respuesta ambigua del SII **no implica rechazo**.

El documento debe quedar en un estado recuperable (`UNKNOWN`) hasta determinar su situación mediante los mecanismos disponibles del SII.

---

## 5. Roadmap

| Hito                  | Nombre            | Entregable                                                                     |
| :-------------------- | :---------------- | :----------------------------------------------------------------------------- |
| **M0 [IMPLEMENTADO]** | **Modelo Fiscal** | `Invoice`, `Money`, `Rut`, impuestos y validaciones sin dependencias externas. |
| **M1 [IMPLEMENTADO]** | **Folios y CAF**  | Parser CAF, repositorio y asignación atómica de folios.                        |
| **M2**                | **TED**           | Construcción y firma del TED según especificación SII.                         |
| **M3**                | **XML y XSD**     | Serialización del DTE y validación contra XSD oficiales.                       |
| **M4**                | **XMLDSig**       | Firma digital del DTE y `EnvioDTE`.                                            |
| **M5**                | **Gateway SII**   | Autenticación, transmisión y consulta de estado.                               |
| **M6**                | **End-to-End**    | `IssueInvoice` ejecutando el flujo completo en certificación.                  |

---

## 6. Criterio de Éxito

El MVP se considera completo cuando una prueba de integración automatizada pueda:

1. Recibir una factura para un `tenantId`.
2. Asignar un folio válido del CAF.
3. Generar y timbrar el DTE.
4. Firmar correctamente el XML.
5. Autenticarse contra certificación SII.
6. Transmitir el `EnvioDTE` y obtener `TrackID`.
7. Persistir y consultar el estado del documento.
8. Reintentar la misma operación con la misma `idempotencyKey` sin consumir otro folio ni generar un envío duplicado.
