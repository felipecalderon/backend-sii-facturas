import { CertificateRepository } from '../../domain/certificate/ports/certificate.repository.js';
import { SiiGateway } from '../../domain/sii/ports/sii-gateway.port.js';
import { SiiEnvironment } from '../../domain/sii/values/sii-domain.types.js';
import { SiiTokenCache } from '../../infrastructure/sii/sii-token-cache.js';
import { SiiSeedSigner } from '../../infrastructure/crypto/sii-seed-signer.js';
import { NoActiveCertificateError } from '../../domain/certificate/errors/certificate-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export interface AuthenticateSiiDto {
  tenantId: string;
  environment?: SiiEnvironment;
  forceRefresh?: boolean;
}

export interface AuthenticateSiiResult {
  token: string;
  environment: SiiEnvironment;
}

export class AuthenticateSiiUseCase {
  constructor(
    private readonly certificateRepository: CertificateRepository,
    private readonly siiGateway: SiiGateway,
    private readonly tokenCache: SiiTokenCache = new SiiTokenCache()
  ) {}

  public async execute(
    dto: AuthenticateSiiDto
  ): Promise<AuthenticateSiiResult> {
    if (!dto.tenantId || dto.tenantId.trim().length === 0) {
      throw new FiscalValidationError(
        'El tenantId es obligatorio para autenticarse con el SII'
      );
    }

    const env = dto.environment ?? 'CERTIFICATION';

    // 1. Revisar si hay un token válido en caché
    if (!dto.forceRefresh) {
      const cachedToken = this.tokenCache.get(dto.tenantId, env);
      if (cachedToken) {
        return {
          token: cachedToken,
          environment: env
        };
      }
    }

    // 2. Obtener certificado activo del tenant
    const certificate = await this.certificateRepository.findActiveCertificate(
      dto.tenantId
    );

    if (!certificate) {
      throw new NoActiveCertificateError(dto.tenantId);
    }

    // 3. Obtener semilla desde el SII
    const seed = await this.siiGateway.getSeed(env);

    // 4. Firmar la semilla digitalmente
    const signedSeedXml = SiiSeedSigner.sign(seed, certificate);

    // 5. Solicitar token al SII
    const token = await this.siiGateway.getToken(signedSeedXml, env);

    // 6. Cachear token
    this.tokenCache.set(dto.tenantId, env, token);

    return {
      token,
      environment: env
    };
  }
}
