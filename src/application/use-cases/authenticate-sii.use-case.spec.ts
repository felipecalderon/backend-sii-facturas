import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthenticateSiiUseCase } from './authenticate-sii.use-case.js';
import { CertificateRepository } from '../../domain/certificate/ports/certificate.repository.js';
import { SiiGateway } from '../../domain/sii/ports/sii-gateway.port.js';
import { SiiTokenCache } from '../../infrastructure/sii/sii-token-cache.js';
import { DigitalCertificate } from '../../domain/certificate/values/digital-certificate.vo.js';
import { createEphemeralCertificate } from '../../infrastructure/crypto/test-cert-helper.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { NoActiveCertificateError } from '../../domain/certificate/errors/certificate-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

describe('AuthenticateSiiUseCase', () => {
  let certRepo: CertificateRepository;
  let siiGateway: SiiGateway;
  let tokenCache: SiiTokenCache;

  const testCert = (() => {
    const ephem = createEphemeralCertificate('pass123', '15123456-9');
    return DigitalCertificate.create({
      rutTitular: Rut.of(ephem.rutTitular),
      privateKeyPem: ephem.privateKeyPem,
      certificatePem: ephem.certificatePem,
      validFrom: new Date(Date.now() - 1000 * 60 * 60),
      validTo: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
    });
  })();

  beforeEach(() => {
    certRepo = {
      saveEncryptedCertificate: vi.fn(),
      findActiveCertificate: vi.fn().mockResolvedValue(testCert)
    };

    siiGateway = {
      getSeed: vi.fn().mockResolvedValue('000000000099'),
      getToken: vi.fn().mockResolvedValue('MOCK_SESSION_TOKEN_XYZ'),
      sendDte: vi.fn(),
      querySendStatus: vi.fn()
    };

    tokenCache = new SiiTokenCache();
  });

  it('debe solicitar semilla, firmarla, obtener token y almacenarlo en caché', async () => {
    const useCase = new AuthenticateSiiUseCase(
      certRepo,
      siiGateway,
      tokenCache
    );

    const result = await useCase.execute({
      tenantId: 'tenant-auth',
      environment: 'CERTIFICATION'
    });

    expect(result.token).toBe('MOCK_SESSION_TOKEN_XYZ');
    expect(result.environment).toBe('CERTIFICATION');

    expect(certRepo.findActiveCertificate).toHaveBeenCalledWith('tenant-auth');
    expect(siiGateway.getSeed).toHaveBeenCalledWith('CERTIFICATION');
    expect(siiGateway.getToken).toHaveBeenCalledTimes(1);

    // Segundo llamado debe venir de caché (sin re-solicitar al Gateway)
    const cachedResult = await useCase.execute({
      tenantId: 'tenant-auth',
      environment: 'CERTIFICATION'
    });

    expect(cachedResult.token).toBe('MOCK_SESSION_TOKEN_XYZ');
    expect(siiGateway.getSeed).toHaveBeenCalledTimes(1); // Se mantiene en 1
  });

  it('debe refrescar el token si se especifica forceRefresh: true', async () => {
    tokenCache.set('tenant-auth', 'CERTIFICATION', 'TOKEN_ANTERIOR');

    const useCase = new AuthenticateSiiUseCase(
      certRepo,
      siiGateway,
      tokenCache
    );

    const result = await useCase.execute({
      tenantId: 'tenant-auth',
      environment: 'CERTIFICATION',
      forceRefresh: true
    });

    expect(result.token).toBe('MOCK_SESSION_TOKEN_XYZ');
    expect(siiGateway.getSeed).toHaveBeenCalledTimes(1);
  });

  it('debe lanzar NoActiveCertificateError si el tenant no tiene certificado activo', async () => {
    vi.mocked(certRepo.findActiveCertificate).mockResolvedValue(null);

    const useCase = new AuthenticateSiiUseCase(
      certRepo,
      siiGateway,
      tokenCache
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-sin-cert'
      })
    ).rejects.toThrow(NoActiveCertificateError);
  });

  it('debe validar que el tenantId no sea vacío', async () => {
    const useCase = new AuthenticateSiiUseCase(
      certRepo,
      siiGateway,
      tokenCache
    );

    await expect(
      useCase.execute({
        tenantId: ''
      })
    ).rejects.toThrow(FiscalValidationError);
  });
});
