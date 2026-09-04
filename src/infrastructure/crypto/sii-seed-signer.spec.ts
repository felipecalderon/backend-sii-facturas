import { describe, it, expect } from 'vitest';
import { SiiSeedSigner } from './sii-seed-signer.js';
import { DigitalCertificate } from '../../domain/certificate/values/digital-certificate.vo.js';
import { createEphemeralCertificate } from './test-cert-helper.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

describe('SiiSeedSigner', () => {
  const getTestCert = () => {
    const ephem = createEphemeralCertificate('pass123', '15123456-9');
    return DigitalCertificate.create({
      rutTitular: Rut.of(ephem.rutTitular),
      privateKeyPem: ephem.privateKeyPem,
      certificatePem: ephem.certificatePem,
      validFrom: new Date(Date.now() - 1000 * 60 * 60),
      validTo: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
    });
  };

  it('debe firmar el XML de la semilla con XMLDSig RSA-SHA1 enveloped y permitir su verificación', () => {
    const cert = getTestCert();
    const seed = '012345678901';

    const signedXml = SiiSeedSigner.sign(seed, cert);

    expect(signedXml).toBeDefined();
    expect(signedXml).toContain('<?xml version="1.0" encoding="ISO-8859-1"?>');
    expect(signedXml).toContain('<getToken');
    expect(signedXml).toContain('<Semilla>012345678901</Semilla>');
    expect(signedXml).toContain(
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">'
    );
    expect(signedXml).toContain('<KeyValue><RSAKeyValue><Modulus>');
    expect(signedXml).toContain('<X509Data><X509Certificate>');

    const isValid = SiiSeedSigner.verify(signedXml);
    expect(isValid).toBe(true);
  });

  it('debe invalidar la firma si la semilla o el XML es alterado', () => {
    const cert = getTestCert();
    const seed = '012345678901';

    const signedXml = SiiSeedSigner.sign(seed, cert);
    const tamperedXml = signedXml.replace('012345678901', '999999999999');

    const isValid = SiiSeedSigner.verify(tamperedXml);
    expect(isValid).toBe(false);
  });

  it('debe rechazar semillas vacías', () => {
    const cert = getTestCert();

    expect(() => SiiSeedSigner.sign('', cert)).toThrow(FiscalValidationError);
    expect(() => SiiSeedSigner.sign('   ', cert)).toThrow(
      FiscalValidationError
    );
  });
});
