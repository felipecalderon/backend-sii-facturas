import { describe, it, expect } from 'vitest';
import { EncryptionService } from './encryption.service.js';
import { CertificateEncryptionError } from '../../domain/certificate/errors/certificate-domain.error.js';

describe('EncryptionService (AES-256-GCM)', () => {
  const masterKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const service = new EncryptionService(masterKey);

  it('debe cifrar y descifrar texto plano correctamente', () => {
    const secretText = 'ContraseñaSecreta123!';
    const encrypted = service.encryptString(secretText);

    expect(encrypted.encrypted).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.encrypted).not.toBe(secretText);

    const decrypted = service.decryptString(encrypted);
    expect(decrypted).toBe(secretText);
  });

  it('debe cifrar y descifrar buffers binarios (certificados)', () => {
    const binaryData = Buffer.from([0x30, 0x82, 0x03, 0x4a, 0x02, 0x01, 0x03]);
    const encrypted = service.encrypt(binaryData);

    const decrypted = service.decrypt(encrypted);
    expect(Buffer.compare(decrypted, binaryData)).toBe(0);
  });

  it('debe fallar al descifrar si el ciphertext o authTag son manipulados', () => {
    const encrypted = service.encryptString('Datos sensibles');

    // Manipular un carácter del tag de autenticación
    const tamperedPayload = {
      ...encrypted,
      authTag: encrypted.authTag.replace(/^[0-9a-f]/, 'z')
    };

    expect(() => service.decryptString(tamperedPayload)).toThrow(
      CertificateEncryptionError
    );
  });
});
