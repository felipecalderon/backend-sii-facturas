# Motor de Facturación Electrónica SII — Reglas de Arquitectura NestJS

## 1. Objetivo

Mantener una arquitectura ordenada, reutilizable, testeable y resistente al crecimiento.

La regla principal es:

> **Cada responsabilidad debe tener un único lugar donde implementarse.**

---

## 2. Dependencias

La dirección de dependencias es siempre hacia el dominio:

```text
Infrastructure → Application → Domain
```

- **Domain:** reglas fiscales, entidades, Value Objects y contratos.
- **Application:** casos de uso y orquestación.
- **Infrastructure:** MongoDB, HTTP, SOAP, XML, criptografía, Redis, etc.

El dominio **no depende de NestJS ni de ninguna librería de infraestructura**.

---

## 3. Casos de Uso

La lógica de negocio se organiza alrededor de casos de uso:

```text
IssueInvoice
AllocateFolio
StampDte
SignDte
SubmitDte
QuerySubmission
```

Los controllers deben ser delgados:

```text
HTTP → Controller → Use Case → Domain → Infrastructure
```

No colocar lógica fiscal, consultas de base de datos ni llamadas al SII directamente en controllers.

---

## 4. Reutilización

Antes de crear lógica nueva:

1. Buscar si el comportamiento ya existe.
2. Determinar si representa realmente el mismo concepto.
3. Reutilizar si corresponde.
4. Extraer una abstracción solo cuando exista una responsabilidad compartida real.

Evitar:

- `utils.ts` gigantes.
- Helpers genéricos sin dominio.
- Copiar y pegar reglas fiscales.
- Abstracciones creadas únicamente para evitar unas pocas líneas duplicadas.

---

## 5. Separación de Responsabilidades

Una clase o módulo debe tener una responsabilidad clara.

Ejemplos:

```text
FolioAllocator      → asigna folios
TedSigner           → firma TED
DteSigner           → firma DTE
XmlRenderer         → genera XML
SiiAuthenticator    → obtiene token SII
SiiSubmission       → transmite DTE
```

Evitar servicios que acumulen generación XML, criptografía, persistencia y comunicación con SII.

---

## 6. Puertos y Adaptadores

El código de aplicación y dominio depende de interfaces:

```ts
interface FolioRepository {}
interface CertificateProvider {}
interface DteRepository {}
interface SiiGateway {}
```

Las implementaciones concretas pertenecen a Infrastructure:

```text
MongoFolioRepository
CloudCertificateProvider
MongoDteRepository
SiiHttpGateway
```

El dominio no debe conocer MongoDB, Mongoose, Axios, SOAP, Redis ni APIs del SII.

---

## 7. DTO ≠ Dominio ≠ Persistencia

Mantener separados:

```text
HTTP DTO
   ↓
Domain Model
   ↓
Persistence Model
```

Los mappers transforman datos; **no contienen reglas fiscales**.

---

## 8. Persistencia y Concurrencia

- Las transacciones protegen invariantes locales.
- Nunca mantener una transacción abierta mientras se comunica con el SII.
- La asignación de folios debe ser atómica.
- Un DTE debe persistirse antes de transmitirse.
- Los reintentos deben ser seguros e idempotentes.

---

## 9. Multitenancy

Toda entidad fiscal pertenece a un `tenantId`.

El aislamiento debe existir en:

```text
Domain
Application
Repository
Database
Cache
Logs
```

`AsyncLocalStorage` puede utilizarse para contexto y observabilidad, pero **no constituye por sí mismo una barrera de seguridad**.

---

## 10. Errores y Observabilidad

Distinguir al menos:

```text
DomainError
ExternalServiceError
InfrastructureError
```

Toda operación relevante debe permitir rastrear:

```text
requestId
tenantId
documentId
tipoDte
folio
trackId
```

Nunca registrar certificados, claves privadas, tokens ni secretos.

---

## 11. Tests

La arquitectura debe permitir probar cada capa independientemente.

```text
Domain        → unit tests
Application   → unit + integration tests
Infrastructure → integration tests
SII           → contract / certification tests
```

Las dependencias externas deben poder reemplazarse por fakes o mocks.

---

## 12. Regla Final

Antes de agregar código, responder:

> **¿Qué concepto es dueño de esta responsabilidad?**

Si ya existe, reutilizarlo.

Si no existe, crearlo en el nivel correcto.

La arquitectura debe hacer que **duplicar lógica, mezclar responsabilidades o saltarse las reglas fiscales sea difícil**.
