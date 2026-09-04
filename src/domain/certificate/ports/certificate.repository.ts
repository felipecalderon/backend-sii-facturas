import { DigitalCertificate } from '../values/digital-certificate.vo.js';

export interface SaveEncryptedCertificateDto {
  tenantId: string;
  encryptedBinary: string; // Base64
  binaryIv: string; // Hex
  binaryAuthTag: string; // Hex
  encryptedPassword: string; // Hex
  passwordIv: string; // Hex
  passwordAuthTag: string; // Hex
  rutTitular: string;
  validFrom: Date;
  validTo: Date;
}

export interface CertificateRepository {
  saveEncryptedCertificate(dto: SaveEncryptedCertificateDto): Promise<void>;
  findActiveCertificate(tenantId: string): Promise<DigitalCertificate | null>;
}

export const CERTIFICATE_REPOSITORY_TOKEN = 'CERTIFICATE_REPOSITORY';
