import crypto from 'node:crypto';
import { CertificateEncryptionError } from '../../domain/certificate/errors/certificate-domain.error.js';

export interface EncryptedPayload {
  encrypted: string; // Base64
  iv: string; // Hex
  authTag: string; // Hex
}

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits recomendado para GCM

  private readonly key: Buffer;

  constructor(masterKey?: string) {
    const rawKey = masterKey || process.env.CERTIFICATE_MASTER_KEY;
    if (!rawKey || rawKey.trim().length === 0) {
      throw new CertificateEncryptionError(
        'La variable CERTIFICATE_MASTER_KEY no está configurada en las variables de entorno'
      );
    }

    // Asegurar 32 bytes exactos mediante SHA-256
    this.key = crypto.createHash('sha256').update(rawKey.trim()).digest();
  }

  public encrypt(data: Buffer | Uint8Array): EncryptedPayload {
    try {
      const iv = crypto.randomBytes(EncryptionService.IV_LENGTH);
      const cipher = crypto.createCipheriv(
        EncryptionService.ALGORITHM,
        this.key,
        iv
      );

      const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return {
        encrypted: encrypted.toString('base64'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (err) {
      throw new CertificateEncryptionError(
        `Error cifrando datos: ${(err as Error).message}`
      );
    }
  }

  public decrypt(payload: EncryptedPayload): Buffer {
    try {
      const iv = Buffer.from(payload.iv, 'hex');
      const authTag = Buffer.from(payload.authTag, 'hex');
      const encryptedBuffer = Buffer.from(payload.encrypted, 'base64');

      const decipher = crypto.createDecipheriv(
        EncryptionService.ALGORITHM,
        this.key,
        iv
      );
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final()
      ]);
    } catch (err) {
      throw new CertificateEncryptionError(
        `Error descifrando datos o clave/tag no válidos: ${(err as Error).message}`
      );
    }
  }

  public encryptString(text: string): EncryptedPayload {
    return this.encrypt(Buffer.from(text, 'utf-8'));
  }

  public decryptString(payload: EncryptedPayload): string {
    return this.decrypt(payload).toString('utf-8');
  }
}
