import forge from 'node-forge';

export function createEphemeralCertificate(
  password = 'cert-password-123',
  rut = '76123456-0'
): {
  p12Buffer: Buffer;
  privateKeyPem: string;
  certificatePem: string;
  rutTitular: string;
} {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 1000 * 60 * 60); // 1 hora atrás
  cert.validity.notAfter = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365); // 1 año de vigencia

  const attrs = [
    { name: 'commonName', value: `Representante Legal ${rut}` },
    { name: 'countryName', value: 'CL' }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des'
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12Buffer = Buffer.from(p12Der, 'binary');

  return {
    p12Buffer,
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certificatePem: forge.pki.certificateToPem(cert),
    rutTitular: rut
  };
}
