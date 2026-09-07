import { SignedXml } from 'xml-crypto';
import { DigitalCertificate } from '../../domain/certificate/values/digital-certificate.vo.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

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

    // 1. Limpiar declaraciones XML de los DTEs individuales
    const cleanedDtes = signedDteXmls.map((xml) =>
      xml.replace(/<\?xml[\s\S]*?\?>/i, '').trim()
    );

    // 2. Construir árbol XML preliminar de EnvioDTE
    const unsignedEnvioXml =
      `<EnvioDTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd" version="1.0">` +
      `<SetDTE ID="SetDoc">` +
      `<Caratula version="1.0">` +
      `<RutEmisor>${rutEmisorStr}</RutEmisor>` +
      `<RutEnvia>${rutEnviaStr}</RutEnvia>` +
      `<RutReceptor>${rutReceptorStr}</RutReceptor>` +
      `<FchResol>${fchResol}</FchResol>` +
      `<NroResol>${nroResol}</NroResol>` +
      `<TmstFirmaEnv>${tmstStr}</TmstFirmaEnv>` +
      `<SubTotDTE>` +
      `<TpoDTE>${tipoDte}</TpoDTE>` +
      `<NroDTE>${nroDte}</NroDTE>` +
      `</SubTotDTE>` +
      `</Caratula>` +
      cleanedDtes.join('\n') +
      `</SetDTE>` +
      `</EnvioDTE>`;

    // 3. Configurar firma digital XMLDSig sobre el nodo SetDTE
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

    sig.getKeyInfoContent = () => {
      return (
        `<KeyValue><RSAKeyValue><Modulus>${modulus}</Modulus><Exponent>${exponent}</Exponent></RSAKeyValue></KeyValue>` +
        `<X509Data><X509Certificate>${cleanCert}</X509Certificate></X509Data>`
      );
    };

    sig.computeSignature(unsignedEnvioXml, {
      location: {
        reference: `//*[local-name()='SetDTE']`,
        action: 'after'
      }
    });

    const signedXml = sig.getSignedXml();

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
