# Motor de Facturación Electrónica SII — Objetivos y Roadmap

## 1. Estado Actual: Fase 1 — Core del Motor Fiscal [COMPLETADO]

Se implementó el motor de dominio y orquestación con separación criptográfica, multitenancy nativo e idempotencia:

- **M0 (Modelo Fiscal):** Entidades `Invoice`, `Money`, `Rut`, totales e invariantes de cálculo fiscal.
- **M1 (Folios y CAF):** Parser CAF, persistencia y asignación atómica concurrente de folios.
- **M2 (TED):** Construcción y firma RSA-SHA1 del timbre con clave privada del CAF.
- **M3 (XML y XSD):** Serialización ISO-8859-1 y validación estricta contra esquemas XSD oficiales.
- **M4 (XMLDSig):** Firma digital en memoria de `DTE` y sobre `EnvioDTE` con certificado digital.
- **M5 (Gateway SII):** Autenticación (semilla → token con caché), transmisión multipart y consulta de estado.
- **M6 (End-to-End):** Orquestador `IssueInvoiceUseCase`, persistencia previa a transmisión (`PERSISTED`), regla de incertidumbre (`UNKNOWN`) e idempotencia por `(tenantId, idempotencyKey)`.

---

## 2. Fase 2: API REST y Cableado NestJS

### 2.1. Propósito

Exponer el motor fiscal como una API HTTP modular, tipada y segura en NestJS, permitiendo la integración de clientes (frontend o servicios externos) sin introducir dependencias adicionales.

### 2.2. Principios de Diseño API

1. **Contexto Multitenant:** Extracción consistente del `tenantId` (vía header `x-tenant-id` o autenticación). Ninguna operación fiscal ocurre sin tenant.
2. **Validación en Frontera:** Todo payload HTTP se valida estrictamente con `class-validator` antes de tocar el dominio.
3. **Mapeo de Errores Fiscales:** Un `ExceptionFilter` traduce excepciones de dominio (`FiscalValidationError`, `TenantMismatchError`, `SiiConnectionError`, etc.) a códigos HTTP estándar (400, 403, 404, 409, 422, 502, 504).
4. **Idempotencia HTTP:** Soporte del header `Idempotency-Key` en operaciones de emisión (`POST /invoices`).
5. **Sin dependencias extra:** Conexión a MongoDB y registro de repositorios/casos de uso utilizando únicamente los paquetes ya instalados (`mongoose`, `@nestjs/common`, `class-validator`).

---

## 3. Roadmap Fase 2

| Hito                  | Nombre                                      | Entregable Medible                                                                                                                                                                                                                                                               |
| :-------------------- | :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M7 [IMPLEMENTADO]** | **Módulos e Infraestructura NestJS**        | Conexión administrada de `Mongoose`, registro de repositorios (`MongoCertificateRepository`, `MongoFolioRepository`, `MongoInvoiceRepository`) y configuración de inyección de dependencias en módulos dedicados (`CertificateModule`, `FolioModule`, `DteModule`, `SiiModule`). |
| **M8**                | **Controladores y DTOs de Configuración**   | `CertificatesController` (`POST /certificates`) para carga de .p12 cifrado en memoria y `CafsController` (`POST /cafs`, `GET /folios/status`) para importación de CAF y consulta de folios disponibles. DTOs con validación estricta.                                            |
| **M9**                | **Controlador de Facturación y Consulta**   | `InvoicesController` con `POST /invoices` (emisión con idempotencia) y `GET /invoices/:folio/status` (consulta y sincronización de estado con SII).                                                                                                                              |
| **M10**               | **Filtros de Excepción y Pruebas E2E HTTP** | `FiscalExceptionFilter` global y suite de pruebas E2E con `supertest` que valide los flujos HTTP completos (201 Created, 200 OK en duplicado por idempotencia, 422 en cálculo inválido, 504 en timeout SII).                                                                     |

---

## 4. Criterio de Éxito de la Fase 2

El servicio HTTP se considerará listo cuando una prueba E2E (`test/app.e2e-spec.ts`):

1. Inicialice la aplicación NestJS completa con su módulo raíz.
2. Cargue un certificado y un CAF vía `POST` HTTP.
3. Emita una factura vía `POST /invoices` con header `x-tenant-id` e `Idempotency-Key`, recibiendo HTTP 201 con `folio` y `trackId`.
4. Reintente el mismo `POST /invoices` con el mismo `Idempotency-Key`, recibiendo HTTP 200/201 con el mismo folio sin duplicar transacciones.
5. Consulte el estado vía `GET /invoices/:folio/status`, recibiendo el estado actual del SII.
6. Envíe un payload con totales inconsistentes o RUT mal formado, recibiendo HTTP 400/422 estructurado sin exponer trazas internas.
