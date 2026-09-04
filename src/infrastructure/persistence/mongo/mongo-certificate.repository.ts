import type { Model } from 'mongoose';
import {
  CertificateRepository,
  SaveEncryptedCertificateDto
} from '../../../domain/certificate/ports/certificate.repository.js';
import { DigitalCertificate } from '../../../domain/certificate/values/digital-certificate.vo.js';
import { Rut } from '../../../domain/shared/rut.vo.js';
import { EncryptionService } from '../../security/encryption.service.js';
import { Pkcs12Parser } from '../../crypto/pkcs12-parser.js';
import {
  CertificateDocument,
  getCertificateModel
} from './schemas/certificate.schema.js';

export class MongoCertificateRepository implements CertificateRepository {
  private readonly certModel: Model<CertificateDocument>;
  private readonly encryptionService: EncryptionService;

  constructor(
    customModel?: Model<CertificateDocument>,
    customEncryption?: EncryptionService
  ) {
    this.certModel = customModel ?? getCertificateModel();
    this.encryptionService = customEncryption ?? new EncryptionService();
  }

  public async saveEncryptedCertificate(
    dto: SaveEncryptedCertificateDto
  ): Promise<void> {
    // Desactivar certificados previos del tenant
    await this.certModel.updateMany(
      { tenantId: dto.tenantId, activo: true },
      { $set: { activo: false } }
    );

    await this.certModel.create({
      tenantId: dto.tenantId,
      encryptedBinary: dto.encryptedBinary,
      binaryIv: dto.binaryIv,
      binaryAuthTag: dto.binaryAuthTag,
      encryptedPassword: dto.encryptedPassword,
      passwordIv: dto.passwordIv,
      passwordAuthTag: dto.passwordAuthTag,
      rutTitular: dto.rutTitular,
      validFrom: dto.validFrom,
      validTo: dto.validTo,
      activo: true
    });
  }

  public async findActiveCertificate(
    tenantId: string
  ): Promise<DigitalCertificate | null> {
    const doc = await this.certModel.findOne({ tenantId, activo: true }).exec();
    if (!doc) {
      return null;
    }

    // 1. Descifrar binario y contraseña en memoria (nunca se escribe en disco)
    const decryptedBinary = this.encryptionService.decrypt({
      encrypted: doc.encryptedBinary,
      iv: doc.binaryIv,
      authTag: doc.binaryAuthTag
    });

    const decryptedPassword = this.encryptionService.decryptString({
      encrypted: doc.encryptedPassword,
      iv: doc.passwordIv,
      authTag: doc.passwordAuthTag
    });

    // 2. Parsear contenedor PKCS#12 en memoria
    const parsed = Pkcs12Parser.parse(decryptedBinary, decryptedPassword);

    const certificate = DigitalCertificate.create({
      privateKeyPem: parsed.privateKeyPem,
      certificatePem: parsed.certificatePem,
      rutTitular: parsed.rutTitular ?? Rut.of(doc.rutTitular),
      validFrom: parsed.validFrom,
      validTo: parsed.validTo,
      subject: parsed.subject
    });

    // 3. Validar vigencia
    certificate.validateValidity(tenantId);

    return certificate;
  }
}
