import crypto from 'node:crypto';
import { Rut } from '../../shared/rut.vo.js';
import {
  CertificateExpiredError,
  InvalidCertificateError
} from '../errors/certificate-domain.error.js';

export interface DigitalCertificateProps {
  privateKeyPem: string;
  certificatePem: string;
  rutTitular: Rut;
  validFrom: Date;
  validTo: Date;
  subject?: string;
  issuer?: string;
}

export class DigitalCertificate {
  public readonly privateKeyPem: string;
  public readonly certificatePem: string;
  public readonly rutTitular: Rut;
  public readonly validFrom: Date;
  public readonly validTo: Date;
  public readonly subject?: string;
  public readonly issuer?: string;

  private constructor(props: DigitalCertificateProps) {
    this.privateKeyPem = props.privateKeyPem;
    this.certificatePem = props.certificatePem;
    this.rutTitular = props.rutTitular;
    this.validFrom = props.validFrom;
    this.validTo = props.validTo;
    this.subject = props.subject;
    this.issuer = props.issuer;
  }

  public static create(props: DigitalCertificateProps): DigitalCertificate {
    if (!props.privateKeyPem || !props.privateKeyPem.includes('PRIVATE KEY')) {
      throw new InvalidCertificateError(
        'La clave privada PEM es inválida o no está presente'
      );
    }
    if (
      !props.certificatePem ||
      !props.certificatePem.includes('CERTIFICATE')
    ) {
      throw new InvalidCertificateError(
        'El certificado X.509 PEM es inválido o no está presente'
      );
    }

    return new DigitalCertificate(props);
  }

  public isExpired(asOfDate: Date = new Date()): boolean {
    return asOfDate.getTime() > this.validTo.getTime();
  }

  public isNotYetValid(asOfDate: Date = new Date()): boolean {
    return asOfDate.getTime() < this.validFrom.getTime();
  }

  public validateValidity(tenantId: string, asOfDate: Date = new Date()): void {
    if (this.isExpired(asOfDate)) {
      throw new CertificateExpiredError(tenantId, this.validTo);
    }
    if (this.isNotYetValid(asOfDate)) {
      throw new InvalidCertificateError(
        `El certificado aún no entra en vigencia (válido desde ${this.validFrom.toISOString()})`
      );
    }
  }

  public getCleanCertificate(): string {
    return this.certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
  }

  public getModulusAndExponent(): { modulus: string; exponent: string } {
    try {
      const pubKey = crypto.createPublicKey(this.certificatePem);
      const jwk = pubKey.export({ format: 'jwk' });

      if (!jwk.n || !jwk.e) {
        throw new InvalidCertificateError(
          'No se pudieron extraer los parámetros RSA del certificado'
        );
      }

      // Convertir Base64URL de JWK a Base64 estándar
      const base64UrlToBase64 = (b64Url: string): string => {
        let b64 = b64Url.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4 !== 0) {
          b64 += '=';
        }
        return b64;
      };

      return {
        modulus: base64UrlToBase64(jwk.n),
        exponent: base64UrlToBase64(jwk.e)
      };
    } catch (err) {
      throw new InvalidCertificateError(
        `Error extrayendo clave pública RSA: ${(err as Error).message}`
      );
    }
  }
}
