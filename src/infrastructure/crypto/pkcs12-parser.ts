import forge from 'node-forge';
import crypto from 'node:crypto';
import { Rut } from '../../domain/shared/rut.vo.js';
import {
  InvalidCertificatePasswordError,
  InvalidCertificateError
} from '../../domain/certificate/errors/certificate-domain.error.js';

export interface ParsedPkcs12 {
  privateKeyPem: string;
  certificatePem: string;
  validFrom: Date;
  validTo: Date;
  rutTitular?: Rut;
  subject: string;
}

export class Pkcs12Parser {
  public static parse(p12Buffer: Buffer, password: string): ParsedPkcs12 {
    let p12: forge.pkcs12.Pkcs12Pfx;

    try {
      const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    } catch {
      throw new InvalidCertificatePasswordError(
        'No se pudo abrir el certificado PKCS#12 con la contraseña proporcionada'
      );
    }

    // 1. Extraer clave privada
    const keyBags =
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] ||
      p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];

    if (!keyBags || keyBags.length === 0 || !keyBags[0].key) {
      throw new InvalidCertificateError(
        'El archivo PKCS#12 no contiene una clave privada utilizable'
      );
    }

    const privateKeyPem = forge.pki.privateKeyToPem(keyBags[0].key);

    // 2. Extraer certificado X.509
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ];

    if (!certBags || certBags.length === 0 || !certBags[0].cert) {
      throw new InvalidCertificateError(
        'El archivo PKCS#12 no contiene un certificado X.509'
      );
    }

    const certificatePem = forge.pki.certificateToPem(certBags[0].cert);

    // 3. Inspeccionar vigencia y sujeto con X509Certificate nativo de Node.js
    const x509 = new crypto.X509Certificate(certificatePem);
    const validFrom = new Date(x509.validFrom);
    const validTo = new Date(x509.validTo);
    const subject = x509.subject;

    // 4. Intentar extraer RUT del sujeto del certificado
    let rutTitular: Rut | undefined;
    const rutMatch = subject.match(/(\d{7,8}-[\dK])/i);
    if (rutMatch) {
      try {
        rutTitular = Rut.of(rutMatch[1]);
      } catch {
        // Ignorar si el formato no correspondía a un RUT válido
      }
    }

    return {
      privateKeyPem,
      certificatePem,
      validFrom,
      validTo,
      rutTitular,
      subject
    };
  }
}
