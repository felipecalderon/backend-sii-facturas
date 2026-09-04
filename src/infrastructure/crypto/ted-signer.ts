import crypto from 'node:crypto';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { Ted } from '../../domain/dte/values/ted.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export class TedSigner {
  public static generateAndSign(
    invoice: Invoice,
    caf: Caf,
    customTimestamp?: Date,
  ): Ted {
    if (!invoice.folio || invoice.folio <= 0) {
      throw new FiscalValidationError('No se puede generar TED sin un folio asignado');
    }
    if (invoice.items.length === 0) {
      throw new FiscalValidationError('No se puede generar TED sin al menos un ítem');
    }

    const re = invoice.emisor.rut.toCanonical();
    const td = invoice.tipoDte.code.toString();
    const f = invoice.folio.toString();
    const fe = TedSigner.formatDate(invoice.fechaEmision);
    const rr = invoice.receptor.rut.toCanonical();
    const rsr = TedSigner.escapeXml(invoice.receptor.razonSocial.slice(0, 40));
    const mnt = invoice.totales.getTotalClp().toString();
    const it1 = TedSigner.escapeXml(invoice.items[0].nombre.slice(0, 40));
    const cafXml = caf.cafXml.trim();
    const tsted = TedSigner.formatIsoTimestamp(customTimestamp ?? new Date());

    // Construcción exacta del nodo <DD> para el estándar SII
    const ddXml = `<DD><RE>${re}</RE><TD>${td}</TD><F>${f}</F><FE>${fe}</FE><RR>${rr}</RR><RSR>${rsr}</RSR><MNT>${mnt}</MNT><IT1>${it1}</IT1>${cafXml}<TSTED>${tsted}</TSTED></DD>`;

    // Firma RSA-SHA1 sobre el nodo <DD> completo
    const signer = crypto.createSign('RSA-SHA1');
    signer.update(ddXml);
    const signature = signer.sign(caf.clavePrivadaPem, 'base64');

    const rawXml = `<TED version="1.0">${ddXml}<FRMT algoritmo="SHA1withRSA">${signature}</FRMT></TED>`;

    return Ted.create({
      rawXml,
      ddXml,
      tsted,
      signature,
      algoritmo: 'SHA1withRSA',
    });
  }

  public static verify(tedXml: string, publicKeyPem: string): boolean {
    const ddMatch = tedXml.match(/<DD[\s\S]*?<\/DD>/i);
    if (!ddMatch) {
      return false;
    }
    const ddXml = ddMatch[0];

    const frmtMatch = tedXml.match(/<FRMT[\s\S]*?>([\s\S]*?)<\/FRMT>/i);
    if (!frmtMatch) {
      return false;
    }
    const signatureBase64 = frmtMatch[1].replace(/\s+/g, '');

    try {
      const verifier = crypto.createVerify('RSA-SHA1');
      verifier.update(ddXml);
      return verifier.verify(publicKeyPem, signatureBase64, 'base64');
    } catch {
      return false;
    }
  }

  public static convertModulusExponentToPem(
    modulusBase64: string,
    exponentBase64: string,
  ): string {
    const toBase64Url = (b64: string): string =>
      b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const keyObject = crypto.createPublicKey({
      key: {
        kty: 'RSA',
        n: toBase64Url(modulusBase64.trim()),
        e: toBase64Url(exponentBase64.trim()),
      },
      format: 'jwk',
    });

    return keyObject.export({ type: 'spki', format: 'pem' }).toString();
  }

  private static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private static formatIsoTimestamp(date: Date): string {
    const dateStr = TedSigner.formatDate(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${dateStr}T${hours}:${minutes}:${seconds}`;
  }

  private static escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
