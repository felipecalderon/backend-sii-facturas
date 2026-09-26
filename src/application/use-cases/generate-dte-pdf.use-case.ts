import { InvoiceRepository } from '../../domain/dte/ports/invoice.repository.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { DtePdfRenderer } from '../../infrastructure/pdf/dte-pdf-renderer.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export interface GenerateDtePdfDto {
  tenantId: string;
  folio: number;
  tipoDte?: number;
}

export interface GenerateDtePdfResult {
  pdfBuffer: Buffer;
  filename: string;
}

export class GenerateDtePdfUseCase {
  constructor(private readonly invoiceRepository: InvoiceRepository) {}

  public async execute(dto: GenerateDtePdfDto): Promise<GenerateDtePdfResult> {
    if (!dto.tenantId || dto.tenantId.trim().length === 0) {
      throw new FiscalValidationError(
        'El tenantId es obligatorio para generar el documento PDF'
      );
    }
    if (!dto.folio || dto.folio <= 0) {
      throw new FiscalValidationError(
        'El folio debe ser un número entero positivo'
      );
    }

    const tipoDteVo = TipoDte.of(dto.tipoDte ?? 33);

    const invoice = await this.invoiceRepository.findByFolio(
      dto.tenantId,
      tipoDteVo,
      dto.folio
    );

    if (!invoice) {
      throw new FiscalValidationError(
        `No se encontró la factura con folio ${dto.folio} y tipo DTE ${tipoDteVo.code} para el tenant '${dto.tenantId}'`
      );
    }

    if (!invoice.tedXml) {
      throw new FiscalValidationError(
        `La factura con folio ${dto.folio} y tipo DTE ${tipoDteVo.code} no cuenta con timbre electrónico (TED)`
      );
    }

    const pdfBuffer = await DtePdfRenderer.renderToBuffer({ invoice });
    const filename = `dte-${tipoDteVo.code}-${invoice.folio}.pdf`;

    return {
      pdfBuffer,
      filename
    };
  }
}
