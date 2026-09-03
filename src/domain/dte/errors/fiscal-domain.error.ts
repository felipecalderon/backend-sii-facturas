export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidRutError extends DomainError {
  constructor(rut: string, reason?: string) {
    super(`RUT inválido '${rut}'${reason ? `: ${reason}` : ''}`);
  }
}

export class InvalidMoneyError extends DomainError {
  constructor(message: string) {
    super(`Error monetario: ${message}`);
  }
}

export class FiscalValidationError extends DomainError {
  constructor(message: string) {
    super(`Error de validación fiscal: ${message}`);
  }
}

export class FiscalCalculationMismatchError extends DomainError {
  constructor(
    field: string,
    expected: string | number,
    actual: string | number
  ) {
    super(
      `Discrepancia en cálculo fiscal para '${field}': esperado ${expected}, obtenido ${actual}`
    );
  }
}
