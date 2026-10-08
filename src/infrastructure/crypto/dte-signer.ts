import { SignedXml } from 'xml-crypto';
import { DigitalCertificate } from '../../domain/certificate/values/digital-certificate.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export class DteSigner {
  public static sign(
    dteXml: string,
    certificate: DigitalCertificate,
    docId: string
  ): string {
    if (!dteXml || !dteXml.includes('<DTE')) {
      throw new FiscalValidationError(
        'El XML del DTE no es válido para firmar'
      );
    }
    if (!docId) {
      throw new FiscalValidationError(
        'El ID del Documento a firmar es obligatorio'
      );
    }

    // 1. Remover cualquier placeholder de firma previo si existiera
    const cleanXml = dteXml
      .replace(/<Signature[\s\S]*?<\/Signature>/gi, '')
      .replace(/<\?xml[\s\S]*?\?>/i, '')
      .trim();

    // 2. Configurar SignedXml para DTE según normativa SII
    const sig = new SignedXml();
    sig.idAttributes = ['ID', 'Id', 'id'];
    sig.privateKey = certificate.privateKeyPem;
    sig.publicCert = certificate.certificatePem;
    sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
    sig.canonicalizationAlgorithm =
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

    // Referencia al Documento con C14N y SHA-1
    sig.addReference({
      xpath: `//*[@ID='${docId}']`,
      transforms: ['http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
      digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1'
    });

    const { modulus, exponent } = certificate.getModulusAndExponent();
    const cleanCert = certificate.getCleanCertificate();

    // Construir KeyInfo con KeyValue (RSA) y X509Data obligatorio según esquema SII
    sig.getKeyInfoContent = () => {
      return (
        `<KeyValue><RSAKeyValue><Modulus>${modulus}</Modulus><Exponent>${exponent}</Exponent></RSAKeyValue></KeyValue>` +
        `<X509Data><X509Certificate>${cleanCert}</X509Certificate></X509Data>`
      );
    };

    // 3. Computar firma e insertar después de Documento dentro de DTE
    sig.computeSignature(cleanXml, {
      location: {
        reference: `//*[local-name()='Documento']`,
        action: 'after'
      }
    });

    const signedXmlContent = sig.getSignedXml();

    // 4. Restaurar declaración ISO-8859-1 requerida por el SII
    return `<?xml version="1.0" encoding="ISO-8859-1"?>\n${signedXmlContent}`;
  }

  public static verify(signedDteXml: string, referenceId?: string): boolean {
    try {
      const sig = new SignedXml({
        getCertFromKeyInfo: SignedXml.getCertFromKeyInfo
      });
      sig.idAttributes = ['ID', 'Id', 'id'];

      const signatures =
        signedDteXml.match(/<Signature\b[\s\S]*?<\/Signature>/gi) ?? [];
      const signatureMatch = referenceId
        ? signatures.find((signature) => {
            const referenceMatch = signature.match(
              /<Reference\b[^>]*\bURI\s*=\s*(["'])#([^"']+)\1/i
            );
            return referenceMatch?.[2] === referenceId;
          })
        : signatures[0];
      if (!signatureMatch) {
        return false;
      }

      sig.loadSignature(signatureMatch);
      return sig.checkSignature(signedDteXml);
    } catch {
      return false;
    }
  }
}
