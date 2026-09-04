import { SignedXml } from 'xml-crypto';
import { DigitalCertificate } from '../../domain/certificate/values/digital-certificate.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export class SiiSeedSigner {
  public static sign(semilla: string, certificate: DigitalCertificate): string {
    const trimmedSeed = semilla ? semilla.trim() : '';
    if (!trimmedSeed) {
      throw new FiscalValidationError(
        'La semilla es obligatoria para solicitar token al SII'
      );
    }

    const unsignedXml = `<getToken><item><Semilla>${trimmedSeed}</Semilla></item></getToken>`;

    const sig = new SignedXml();
    sig.idAttributes = ['ID', 'Id', 'id'];
    sig.privateKey = certificate.privateKeyPem;
    sig.publicCert = certificate.certificatePem;
    sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
    sig.canonicalizationAlgorithm =
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

    sig.addReference({
      xpath: `//*[local-name()='getToken']`,
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
      ],
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

    sig.computeSignature(unsignedXml, {
      location: {
        reference: `//*[local-name()='item']`,
        action: 'after'
      }
    });

    const signedXml = sig.getSignedXml();
    return `<?xml version="1.0" encoding="ISO-8859-1"?>\n${signedXml}`;
  }

  public static verify(signedXml: string): boolean {
    try {
      const sig = new SignedXml({
        getCertFromKeyInfo: SignedXml.getCertFromKeyInfo
      });
      sig.idAttributes = ['ID', 'Id', 'id'];

      const match = signedXml.match(/<Signature[\s\S]*?<\/Signature>/i);
      if (!match) {
        return false;
      }

      sig.loadSignature(match[0]);
      return sig.checkSignature(signedXml);
    } catch {
      return false;
    }
  }
}
