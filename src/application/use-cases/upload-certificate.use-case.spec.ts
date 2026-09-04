import { describe, it, expect, vi } from 'vitest';
import forge from 'node-forge';
import { UploadCertificateUseCase } from './upload-certificate.use-case.js';
import { CertificateRepository } from '../../domain/certificate/ports/certificate.repository.js';
import { EncryptionService } from '../../infrastructure/security/encryption.service.js';
import { createEphemeralCertificate } from '../../infrastructure/crypto/test-cert-helper.js';
import {
  CertificateExpiredError,
  InvalidCertificatePasswordError
} from '../../domain/certificate/errors/certificate-domain.error.js';

describe('UploadCertificateUseCase', () => {
  const masterKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const encryptionService = new EncryptionService(masterKey);

  const createExpiredEphemeralCertificate = (
    password = 'pass123',
    rut = '76123456-0'
  ) => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60); // 60 días atrás
    cert.validity.notAfter = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10); // expiró hace 10 días

    const attrs = [
      { name: 'commonName', value: `Titular Expirado ${rut}` },
      { name: 'countryName', value: 'CL' }
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
      keys.privateKey,
      [cert],
      password,
      {
        algorithm: '3des'
      }
    );
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const p12Buffer = Buffer.from(p12Der, 'binary');

    return { p12Buffer, password, rut };
  };

  it('debe desempaquetar, validar, cifrar con AES-256-GCM y persistir el certificado', async () => {
    const ephem = createEphemeralCertificate('secreto-seguro', '12345678-5');
    const mockRepo: CertificateRepository = {
      saveEncryptedCertificate: vi.fn().mockResolvedValue(undefined),
      findActiveCertificate: vi.fn()
    };

    const useCase = new UploadCertificateUseCase(mockRepo, encryptionService);

    const result = await useCase.execute({
      tenantId: 'tenant-cert',
      p12Buffer: ephem.p12Buffer,
      password: 'secreto-seguro',
      rutTitular: ephem.rutTitular
    });

    expect(result.tenantId).toBe('tenant-cert');
    expect(result.rutTitular).toBe('12345678-5');
    expect(result.validFrom).toBeInstanceOf(Date);
    expect(result.validTo).toBeInstanceOf(Date);
    expect(mockRepo.saveEncryptedCertificate).toHaveBeenCalledTimes(1);

    const savedRecord = vi.mocked(mockRepo.saveEncryptedCertificate).mock
      .calls[0][0];
    expect(savedRecord.tenantId).toBe('tenant-cert');
    expect(typeof savedRecord.encryptedBinary).toBe('string');
    expect(typeof savedRecord.encryptedPassword).toBe('string');
    expect(typeof savedRecord.binaryIv).toBe('string');
    expect(typeof savedRecord.passwordIv).toBe('string');
    expect(typeof savedRecord.binaryAuthTag).toBe('string');
    expect(typeof savedRecord.passwordAuthTag).toBe('string');
  });

  it('debe rechazar un certificado si la contraseña es incorrecta', async () => {
    const ephem = createEphemeralCertificate('clave-correcta', '12345678-5');
    const mockRepo: CertificateRepository = {
      saveEncryptedCertificate: vi.fn(),
      findActiveCertificate: vi.fn()
    };

    const useCase = new UploadCertificateUseCase(mockRepo, encryptionService);

    await expect(
      useCase.execute({
        tenantId: 'tenant-cert',
        p12Buffer: ephem.p12Buffer,
        password: 'clave-incorrecta'
      })
    ).rejects.toThrow(InvalidCertificatePasswordError);
  });

  it('debe rechazar un certificado que ya se encuentre expirado', async () => {
    const expired = createExpiredEphemeralCertificate('clave123', '76123456-0');
    const mockRepo: CertificateRepository = {
      saveEncryptedCertificate: vi.fn(),
      findActiveCertificate: vi.fn()
    };

    const useCase = new UploadCertificateUseCase(mockRepo, encryptionService);

    await expect(
      useCase.execute({
        tenantId: 'tenant-cert',
        p12Buffer: expired.p12Buffer,
        password: expired.password,
        rutTitular: expired.rut
      })
    ).rejects.toThrow(CertificateExpiredError);
  });
});
