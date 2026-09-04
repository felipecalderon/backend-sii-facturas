import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { AuthenticateSiiUseCase } from './authenticate-sii.use-case.js';
import { SiiGateway } from '../../domain/sii/ports/sii-gateway.port.js';
import {
  SiiEnvironment,
  SiiSendStatusEnum
} from '../../domain/sii/values/sii-domain.types.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';

import { InvoiceRepository } from '../../domain/dte/ports/invoice.repository.js';

export interface QueryEnvioStatusDto {
  tenantId: string;
  trackId: string;
  rutCompany: Rut;
  invoices?: Invoice[];
  environment?: SiiEnvironment;
}

export interface QueryEnvioStatusResult {
  trackId: string;
  status: SiiSendStatusEnum;
  glosa?: string;
  invoices?: Invoice[];
}

export class QueryEnvioStatusUseCase {
  constructor(
    private readonly authenticateSiiUseCase: AuthenticateSiiUseCase,
    private readonly siiGateway: SiiGateway,
    private readonly invoiceRepository?: InvoiceRepository
  ) {}

  public async execute(
    dto: QueryEnvioStatusDto
  ): Promise<QueryEnvioStatusResult> {
    if (!dto.tenantId || dto.tenantId.trim().length === 0) {
      throw new FiscalValidationError('El tenantId es obligatorio');
    }
    if (!dto.trackId || dto.trackId.trim().length === 0) {
      throw new FiscalValidationError(
        'El trackId es obligatorio para consultar estado'
      );
    }

    if (dto.invoices) {
      for (const inv of dto.invoices) {
        if (inv.tenantId !== dto.tenantId) {
          throw new TenantMismatchError(dto.tenantId, inv.tenantId);
        }
      }
    }

    const env = dto.environment ?? 'CERTIFICATION';

    // 1. Obtener token de sesión activo
    const auth = await this.authenticateSiiUseCase.execute({
      tenantId: dto.tenantId,
      environment: env
    });

    // 2. Consultar estado en el SII
    const statusResult = await this.siiGateway.querySendStatus({
      env,
      token: auth.token,
      rutCompany: dto.rutCompany,
      trackId: dto.trackId
    });

    // 3. Actualizar estado de las facturas si fueron provistas
    if (dto.invoices) {
      for (const inv of dto.invoices) {
        if (statusResult.status === 'EPR') {
          inv.markAccepted();
        } else if (statusResult.status === 'RECH') {
          inv.markRejected(statusResult.glosa ?? 'Envío rechazado por SII');
        } else if (statusResult.status === 'UNKNOWN') {
          inv.markUnknown(
            statusResult.glosa ?? 'Estado de envío indeterminado'
          );
        }
        // Si status === 'REC' permanece en SUBMITTED
      }

      if (this.invoiceRepository) {
        for (const inv of dto.invoices) {
          await this.invoiceRepository.save(inv);
        }
      }
    }

    return {
      trackId: dto.trackId,
      status: statusResult.status,
      glosa: statusResult.glosa,
      invoices: dto.invoices
    };
  }
}
