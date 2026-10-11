import { SignedXml } from 'xml-crypto';
import { DigitalCertificate } from '../../domain/certificate/values/digital-certificate.vo.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import {
  findNonLatin1CodePoint,
  formatUnicodeCodePoint
} from './xml-encoding.js';

export interface EnvioDteOptions {
  rutEmisor: Rut;
  rutEnvia: Rut;
  rutReceptor?: Rut; // Por defecto '60803000-K' del SII
  fchResol: string; // Formato AAAA-MM-DD
  nroResol: number;
  tmstFirmaEnv?: Date;
  tipoDte?: number;
}

export class EnvioDteBuilder {
  public static buildAndSign(
    signedDteXmls: string[],
    certificate: DigitalCertificate,
    options: EnvioDteOptions
  ): string {
    if (!signedDteXmls || signedDteXmls.length === 0) {
      throw new FiscalValidationError(
        'No se puede crear un EnvioDTE sin al menos un DTE'
      );
    }

    const rutEmisorStr = options.rutEmisor.toCanonical();
    const rutEnviaStr = options.rutEnvia.toCanonical();
    const rutReceptorStr = (
      options.rutReceptor ?? Rut.of('60803000-K')
    ).toCanonical();
    const fchResol = options.fchResol;
    const nroResol = options.nroResol;
    if (!fchResol || !/^\d{4}-\d{2}-\d{2}$/.test(fchResol)) {
      throw new FiscalValidationError(
        'La carátula del EnvioDTE requiere fchResol (AAAA-MM-DD) con la fecha de la resolución de autorización del emisor'
      );
    }
    if (
      typeof nroResol !== 'number' ||
      !Number.isInteger(nroResol) ||
      nroResol < 0 ||
      nroResol > 999999
    ) {
      throw new FiscalValidationError(
        'La carátula del EnvioDTE requiere nroResol entero entre 0 y 999999 con el número de la resolución de autorización del emisor'
      );
    }
    const tipoDte = options.tipoDte ?? 33;
    const nroDte = signedDteXmls.length;

    const tmstDate = options.tmstFirmaEnv ?? new Date();
    const tmstStr = EnvioDteBuilder.formatIsoTimestamp(tmstDate);

    // 1. Limpiar declaraciones XML y dejar que el DTE herede el namespace del sobre.
    // Se conserva xsi (contexto de C14N de la firma DTE) y el texto interno,
    // porque C14N también los incluye en sus respectivas firmas.
    const cleanedDtes = signedDteXmls.map((xml) =>
      EnvioDteBuilder.removeDteNamespaceDeclaration(
        xml.replace(/<\?xml[\s\S]*?\?>/i, '').trim()
      )
    );

    // 2. Construir árbol XML preliminar de EnvioDTE respetando saltos e indentación del estándar SII
    const unsignedEnvioXml =
      `<EnvioDTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd" version="1.0">\n` +
      `<SetDTE ID="SetDoc">\n` +
      ` <Caratula version="1.0">\n` +
      `  <RutEmisor>${rutEmisorStr}</RutEmisor>\n` +
      `  <RutEnvia>${rutEnviaStr}</RutEnvia>\n` +
      `  <RutReceptor>${rutReceptorStr}</RutReceptor>\n` +
      `  <FchResol>${fchResol}</FchResol>\n` +
      `  <NroResol>${nroResol}</NroResol>\n` +
      `  <TmstFirmaEnv>${tmstStr}</TmstFirmaEnv>\n` +
      `  <SubTotDTE>\n` +
      `   <TpoDTE>${tipoDte}</TpoDTE>\n` +
      `   <NroDTE>${nroDte}</NroDTE>\n` +
      `  </SubTotDTE>\n` +
      ` </Caratula>\n` +
      cleanedDtes.join('\n') +
      `\n</SetDTE>\n` +
      `</EnvioDTE>`;

    const nonLatin1CodePoint = findNonLatin1CodePoint(unsignedEnvioXml);
    if (nonLatin1CodePoint !== undefined) {
      throw new FiscalValidationError(
        `El EnvioDTE contiene U+${formatUnicodeCodePoint(nonLatin1CodePoint)}, no representable en ISO-8859-1`
      );
    }

    // 3. Firmar el SetDTE ya ensamblado: no aplicar pretty-print ni normalizar
    // espacios después de este punto, porque son nodos de texto incluidos por C14N.
    const sig = new SignedXml();
    sig.idAttributes = ['ID', 'Id', 'id'];
    sig.privateKey = certificate.privateKeyPem;
    sig.publicCert = certificate.certificatePem;
    sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
    sig.canonicalizationAlgorithm =
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

    sig.addReference({
      xpath: `//*[@ID='SetDoc']`,
      transforms: ['http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
      digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1'
    });

    const { modulus, exponent } = certificate.getModulusAndExponent();
    const cleanCert = certificate.getCleanCertificate();

    // Construir KeyInfo con KeyValue (RSA) y X509Data con saltos de línea para evitar CHR-00002
    sig.getKeyInfoContent = () => {
      return (
        '\n<KeyValue>\n' +
        `<RSAKeyValue>\n<Modulus>${modulus}</Modulus>\n<Exponent>${exponent}</Exponent>\n</RSAKeyValue>\n` +
        '</KeyValue>\n' +
        `<X509Data>\n<X509Certificate>${cleanCert}</X509Certificate>\n</X509Data>`
      );
    };

    sig.computeSignature(unsignedEnvioXml, {
      location: {
        reference: `//*[local-name()='SetDTE']`,
        action: 'after'
      }
    });

    let signedXml = sig.getSignedXml();
    // Asegurar saltos de línea para que ninguna línea exceda el buffer del SII (CHR-00002: Line too long)
    signedXml = signedXml
      .replace(/<\/SetDTE><Signature\b/, '</SetDTE>\n<Signature')
      .replace(/<\/SignedInfo><SignatureValue>/, '</SignedInfo>\n<SignatureValue>')
      .replace(/<\/SignatureValue><KeyInfo>/, '</SignatureValue>\n<KeyInfo>')
      .replace(/<\/KeyInfo><\/Signature>/, '</KeyInfo>\n</Signature>')
      .replace(/<\/Signature><\/EnvioDTE>/, '</Signature>\n</EnvioDTE>');

    return `<?xml version="1.0" encoding="ISO-8859-1"?>\n${signedXml}`;
  }

  public static verify(envioDteXml: string): boolean {
    try {
      const sig = new SignedXml({
        getCertFromKeyInfo: SignedXml.getCertFromKeyInfo
      });
      sig.idAttributes = ['ID', 'Id', 'id'];

      const matches = envioDteXml.match(/<Signature[\s\S]*?<\/Signature>/gi);
      if (!matches) {
        return false;
      }

      // La firma del sobre EnvioDTE es la que referencia URI="#SetDoc"
      const envioSig = matches.find((s) => s.includes('URI="#SetDoc"'));
      if (!envioSig) {
        return false;
      }

      sig.loadSignature(envioSig);
      return sig.checkSignature(envioDteXml);
    } catch {
      return false;
    }
  }

  private static removeDteNamespaceDeclaration(xml: string): string {
    const rootTagMatch = xml.match(/^<DTE\b[^>]*>/);
    if (!rootTagMatch) {
      throw new FiscalValidationError(
        'El XML firmado debe tener un nodo raíz DTE para integrarse en EnvioDTE'
      );
    }

    const rootTag = rootTagMatch[0];
    const hasSiiNamespace =
      rootTag.includes('xmlns="http://www.sii.cl/SiiDte"') ||
      rootTag.includes("xmlns='http://www.sii.cl/SiiDte'");
    if (!hasSiiNamespace) {
      throw new FiscalValidationError(
        'El nodo raíz DTE debe declarar el namespace oficial SII antes de integrarse en EnvioDTE'
      );
    }

    // El sobre EnvioDTE ya declara xmlns="http://www.sii.cl/SiiDte" y xmlns:xsi.
    // En el formato oficial del SII (DTE33-ejemplo.xml), el nodo anidado es exactamente <DTE version="1.0">.
    return `<DTE version="1.0">${xml.slice(rootTag.length)}`;
  }

  private static formatIsoTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }
}
