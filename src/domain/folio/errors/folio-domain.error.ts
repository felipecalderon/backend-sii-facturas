import { DomainError } from '../../dte/errors/fiscal-domain.error.js';

export class FoliosExhaustedError extends DomainError {
  constructor(tenantId: string, tipoDte: number, maxFolio: number) {
    super(
      `Folios agotados para tenant '${tenantId}' y tipo DTE ${tipoDte}. Rango máximo alcanzado: ${maxFolio}`
    );
  }
}

export class NoActiveCafError extends DomainError {
  constructor(tenantId: string, tipoDte: number) {
    super(
      `No existe un CAF activo para tenant '${tenantId}' y tipo DTE ${tipoDte}`
    );
  }
}

export class InvalidCafXmlError extends DomainError {
  constructor(reason: string) {
    super(`Error en archivo CAF XML: ${reason}`);
  }
}

export class InvalidFolioSequenceError extends DomainError {
  constructor(message: string) {
    super(`Secuencia de folios inválida: ${message}`);
  }
}

export class TenantMismatchError extends DomainError {
  constructor(expectedTenant: string, actualValue: string) {
    super(
      `Inconsistencia de tenant: se esperaba '${expectedTenant}', pero el valor recibido fue '${actualValue}'`
    );
  }
}
