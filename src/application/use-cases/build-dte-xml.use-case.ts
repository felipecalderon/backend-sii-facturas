import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import {
  DteXmlRenderer,
  RenderDteOptions
} from '../../infrastructure/xml/dte-xml-renderer.js';
import { XsdValidator } from '../../infrastructure/xml/xsd-validator.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export interface BuildDteXmlDto {
  tenantId: string;
  invoice: Invoice;
  validateXsd?: boolean;
  options?: RenderDteOptions;
}

export interface BuildDteXmlResult {
  invoice: Invoice;
  xml: string;
}

export class BuildDteXmlUseCase {
  public async execute(dto: BuildDteXmlDto): Promise<BuildDteXmlResult> {
    if (dto.invoice.tenantId !== dto.tenantId) {
      throw new TenantMismatchError(dto.tenantId, dto.invoice.tenantId);
    }

    if (dto.invoice.estado !== InvoiceStatus.STAMPED) {
      throw new FiscalValidationError(
        `No se puede generar XML para una factura en estado ${dto.invoice.estado}. Debe estar en STAMPED.`
      );
    }

    const xml = DteXmlRenderer.render(dto.invoice, dto.options);

    if (dto.validateXsd !== false) {
      const validation = await XsdValidator.validateDte(xml);
      if (!validation.isValid) {
        throw new FiscalValidationError(
          `Validación XSD fallida para DTE Folio ${dto.invoice.folio}: ${validation.errors.join(' | ')}`
        );
      }
    }

    dto.invoice.setDteXml(xml);

    return {
      invoice: dto.invoice,
      xml
    };
  }
}
