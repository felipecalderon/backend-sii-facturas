import { DomainError } from '../../dte/errors/fiscal-domain.error.js';

export class SiiError extends DomainError {
  constructor(message: string) {
    super(`Error SII: ${message}`);
  }
}

export class SiiAuthenticationError extends SiiError {
  constructor(reason: string) {
    super(`Fallo en autenticación con el SII: ${reason}`);
  }
}

export class SiiConnectionError extends SiiError {
  constructor(reason: string) {
    super(`Fallo de conexión o timeout con el SII: ${reason}`);
  }
}

export class SiiSubmissionError extends SiiError {
  public readonly status?: string;
  public readonly rawResponse?: string;

  constructor(message: string, status?: string, rawResponse?: string) {
    super(message);
    this.status = status;
    this.rawResponse = rawResponse;
  }
}
