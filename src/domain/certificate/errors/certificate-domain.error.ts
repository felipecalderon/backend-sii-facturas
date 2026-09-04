import { DomainError } from '../../dte/errors/fiscal-domain.error.js';

export class CertificateExpiredError extends DomainError {
  constructor(tenantId: string, validTo: Date) {
    super(
      `El certificado digital para tenant '${tenantId}' expiró en fecha ${validTo.toISOString()}`
    );
  }
}

export class InvalidCertificatePasswordError extends DomainError {
  constructor(reason?: string) {
    super(
      `Contraseña del certificado digital inválida${reason ? `: ${reason}` : ''}`
    );
  }
}

export class NoActiveCertificateError extends DomainError {
  constructor(tenantId: string) {
    super(
      `No existe un certificado digital activo registrado para el tenant '${tenantId}'`
    );
  }
}

export class CertificateEncryptionError extends DomainError {
  constructor(message: string) {
    super(`Error en cifrado/descifrado de certificado: ${message}`);
  }
}

export class InvalidCertificateError extends DomainError {
  constructor(message: string) {
    super(`Certificado digital inválido: ${message}`);
  }
}
