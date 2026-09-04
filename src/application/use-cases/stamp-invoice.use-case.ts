import { FolioRepository } from '../../domain/folio/ports/folio.repository.js';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { Ted } from '../../domain/dte/values/ted.vo.js';
import { TedSigner } from '../../infrastructure/crypto/ted-signer.js';
import {
  NoActiveCafError,
  TenantMismatchError,
} from '../../domain/folio/errors/folio-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export interface StampInvoiceDto {
  tenantId: string;
  invoice: Invoice;
  customTimestamp?: Date;
}

export interface StampInvoiceResult {
  invoice: Invoice;
  ted: Ted;
}

export class StampInvoiceUseCase {
  constructor(private readonly folioRepository: FolioRepository) {}

  public async execute(dto: StampInvoiceDto): Promise<StampInvoiceResult> {
    if (dto.invoice.tenantId !== dto.tenantId) {
      throw new TenantMismatchError(dto.tenantId, dto.invoice.tenantId);
    }

    if (!dto.invoice.folio) {
      throw new FiscalValidationError(
        'La factura debe tener un folio asignado antes de poder ser timbrada',
      );
    }

    const caf = await this.folioRepository.findActiveCaf(
      dto.tenantId,
      dto.invoice.tipoDte,
    );

    if (!caf) {
      throw new NoActiveCafError(dto.tenantId, dto.invoice.tipoDte.code);
    }

    const ted = TedSigner.generateAndSign(
      dto.invoice,
      caf,
      dto.customTimestamp,
    );

    dto.invoice.stampTed(ted.rawXml);

    return {
      invoice: dto.invoice,
      ted,
    };
  }
}
