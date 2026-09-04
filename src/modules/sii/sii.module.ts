import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CertificateModule } from '../certificate/certificate.module.js';
import { DteModule } from '../dte/dte.module.js';
import {
  CERTIFICATE_REPOSITORY_TOKEN,
  CertificateRepository
} from '../../domain/certificate/ports/certificate.repository.js';
import {
  INVOICE_REPOSITORY_TOKEN,
  InvoiceRepository
} from '../../domain/dte/ports/invoice.repository.js';
import {
  SII_GATEWAY_TOKEN,
  SiiGateway
} from '../../domain/sii/ports/sii-gateway.port.js';
import { SiiHttpGateway } from '../../infrastructure/sii/sii-http.gateway.js';
import { SiiTokenCache } from '../../infrastructure/sii/sii-token-cache.js';
import { AuthenticateSiiUseCase } from '../../application/use-cases/authenticate-sii.use-case.js';
import { SubmitEnvioDteUseCase } from '../../application/use-cases/submit-envio-dte.use-case.js';
import { QueryEnvioStatusUseCase } from '../../application/use-cases/query-envio-status.use-case.js';

@Module({
  imports: [CertificateModule, forwardRef(() => DteModule)],
  providers: [
    SiiTokenCache,
    {
      provide: SII_GATEWAY_TOKEN,
      useFactory: (config?: ConfigService) => {
        const timeoutMs = config?.get<number>('SII_TIMEOUT_MS') ?? 30000;
        return new SiiHttpGateway({ timeoutMs });
      },
      inject: [{ token: ConfigService, optional: true }]
    },
    {
      provide: AuthenticateSiiUseCase,
      useFactory: (
        certRepo: CertificateRepository,
        gateway: SiiGateway,
        cache: SiiTokenCache
      ) => new AuthenticateSiiUseCase(certRepo, gateway, cache),
      inject: [CERTIFICATE_REPOSITORY_TOKEN, SII_GATEWAY_TOKEN, SiiTokenCache]
    },
    {
      provide: SubmitEnvioDteUseCase,
      useFactory: (authUc: AuthenticateSiiUseCase, gateway: SiiGateway) =>
        new SubmitEnvioDteUseCase(authUc, gateway),
      inject: [AuthenticateSiiUseCase, SII_GATEWAY_TOKEN]
    },
    {
      provide: QueryEnvioStatusUseCase,
      useFactory: (
        authUc: AuthenticateSiiUseCase,
        gateway: SiiGateway,
        invRepo?: InvoiceRepository
      ) => new QueryEnvioStatusUseCase(authUc, gateway, invRepo),
      inject: [
        AuthenticateSiiUseCase,
        SII_GATEWAY_TOKEN,
        { token: INVOICE_REPOSITORY_TOKEN, optional: true }
      ]
    }
  ],
  exports: [
    SII_GATEWAY_TOKEN,
    SiiTokenCache,
    AuthenticateSiiUseCase,
    SubmitEnvioDteUseCase,
    QueryEnvioStatusUseCase
  ]
})
export class SiiModule {}
