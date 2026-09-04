import { CertificateRepository } from '../../domain/certificate/ports/certificate.repository.js';
import { EncryptionService } from '../../infrastructure/security/encryption.service.js';
import { Pkcs12Parser } from '../../infrastructure/crypto/pkcs12-parser.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import {
  CertificateExpiredError,
  InvalidCertificateError
} from '../../domain/certificate/errors/certificate-domain.error.js';

export interface UploadCertificateDto {
  tenantId: string;
  p12Buffer: Buffer;
  password: string;
  rutTitular?: string;
}

export interface UploadCertificateResult {
  tenantId: string;
  rutTitular: string;
  validFrom: Date;
  validTo: Date;
  subject: string;
}

export class UploadCertificateUseCase {
  constructor(
    private readonly certificateRepository: CertificateRepository,
    private readonly encryptionService: EncryptionService = new EncryptionService()
  ) {}

  public async execute(
    dto: UploadCertificateDto
  ): Promise<UploadCertificateResult> {
    if (!dto.tenantId || dto.tenantId.trim().length === 0) {
      throw new InvalidCertificateError('El tenantId es obligatorio');
    }
    if (!dto.p12Buffer || dto.p12Buffer.length === 0) {
      throw new InvalidCertificateError('El archivo de certificado está vacío');
    }
    if (!dto.password) {
      throw new InvalidCertificateError(
        'La contraseña del certificado es obligatoria'
      );
    }

    // 1. Validar que la contraseña abre el archivo y extraer metadatos
    const parsed = Pkcs12Parser.parse(dto.p12Buffer, dto.password);

    // 2. Validar que no esté expirado
    const now = new Date();
    if (now.getTime() > parsed.validTo.getTime()) {
      throw new CertificateExpiredError(dto.tenantId, parsed.validTo);
    }

    // 3. Determinar RUT titular
    let rutFinal: Rut;
    if (parsed.rutTitular) {
      rutFinal = parsed.rutTitular;
    } else if (dto.rutTitular) {
      rutFinal = Rut.of(dto.rutTitular);
    } else {
      throw new InvalidCertificateError(
        'No se pudo inferir el RUT del titular desde el certificado; especifícalo explícitamente'
      );
    }

    // 4. Cifrar binario y contraseña con AES-256-GCM
    const encryptedBinary = this.encryptionService.encrypt(dto.p12Buffer);
    const encryptedPassword = this.encryptionService.encryptString(
      dto.password
    );

    // 5. Persistir en MongoDB (cero archivos en disco)
    await this.certificateRepository.saveEncryptedCertificate({
      tenantId: dto.tenantId,
      encryptedBinary: encryptedBinary.encrypted,
      binaryIv: encryptedBinary.iv,
      binaryAuthTag: encryptedBinary.authTag,
      encryptedPassword: encryptedPassword.encrypted,
      passwordIv: encryptedPassword.iv,
      passwordAuthTag: encryptedPassword.authTag,
      rutTitular: rutFinal.toCanonical(),
      validFrom: parsed.validFrom,
      validTo: parsed.validTo
    });

    return {
      tenantId: dto.tenantId,
      rutTitular: rutFinal.toCanonical(),
      validFrom: parsed.validFrom,
      validTo: parsed.validTo,
      subject: parsed.subject
    };
  }
}
