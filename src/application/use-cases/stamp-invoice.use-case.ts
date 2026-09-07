import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { Ted } from '../../domain/dte/values/ted.vo.js';
import { TedSigner } from '../../infrastructure/crypto/ted-signer.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export interface StampInvoiceDto {
  tenantId: string;
  invoice: Invoice;
  caf: Caf;
  customTimestamp?: Date;
}

export interface StampInvoiceResult {
  invoice: Invoice;
  ted: Ted;
}

export class StampInvoiceUseCase {
  public async execute(dto: StampInvoiceDto): Promise<StampInvoiceResult> {
    if (dto.invoice.tenantId !== dto.tenantId) {
      throw new TenantMismatchError(dto.tenantId, dto.invoice.tenantId);
    }
    if (dto.caf.tenantId !== dto.tenantId) {
      throw new TenantMismatchError(dto.tenantId, dto.caf.tenantId);
    }

    if (!dto.invoice.folio) {
      throw new FiscalValidationError(
        'La factura debe tener un folio asignado antes de poder ser timbrada'
      );
    }

    if (dto.caf.tipoDte.code !== dto.invoice.tipoDte.code) {
      throw new FiscalValidationError(
        `El CAF corresponde al tipo DTE ${dto.caf.tipoDte.code}, pero la factura es tipo DTE ${dto.invoice.tipoDte.code}`
      );
    }
    if (!dto.caf.rutEmisor.equals(dto.invoice.emisor.rut)) {
      throw new FiscalValidationError(
        `El CAF pertenece al emisor ${dto.caf.rutEmisor.toCanonical()}, pero la factura declara el RUT ${dto.invoice.emisor.rut.toCanonical()}`
      );
    }
    if (
      dto.invoice.folio < dto.caf.rangoDesde ||
      dto.invoice.folio > dto.caf.rangoHasta
    ) {
      throw new FiscalValidationError(
        `El folio ${dto.invoice.folio} está fuera del rango autorizado [${dto.caf.rangoDesde}, ${dto.caf.rangoHasta}] del CAF`
      );
    }

    const ted = TedSigner.generateAndSign(
      dto.invoice,
      dto.caf,
      dto.customTimestamp
    );

    dto.invoice.stampTed(ted.rawXml);

    return {
      invoice: dto.invoice,
      ted
    };
  }
}
