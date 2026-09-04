import { CertificateRepository } from '../../domain/certificate/ports/certificate.repository.js';
import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import { EnvioDteBuilder } from '../../infrastructure/xml/envio-dte-builder.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { NoActiveCertificateError } from '../../domain/certificate/errors/certificate-domain.error.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export interface CreateEnvioDteDto {
  tenantId: string;
  invoices: Invoice[];
  rutEnvia: string;
  rutReceptor?: string;
  fchResol?: string;
  nroResol?: number;
}

export interface CreateEnvioDteResult {
  envioDteXml: string;
  totalDtes: number;
}

export class CreateEnvioDteUseCase {
  constructor(private readonly certificateRepository: CertificateRepository) {}

  public async execute(dto: CreateEnvioDteDto): Promise<CreateEnvioDteResult> {
    if (!dto.invoices || dto.invoices.length === 0) {
      throw new FiscalValidationError(
        'Se requiere al menos una factura para generar un EnvioDTE'
      );
    }

    // Validar que todas las facturas pertenezcan al tenant y estén firmadas
    for (const invoice of dto.invoices) {
      if (invoice.tenantId !== dto.tenantId) {
        throw new TenantMismatchError(dto.tenantId, invoice.tenantId);
      }
      const validStates = [
        InvoiceStatus.SIGNED,
        InvoiceStatus.PERSISTED,
        InvoiceStatus.UNKNOWN
      ];
      if (!validStates.includes(invoice.estado) || !invoice.signedDteXml) {
        throw new FiscalValidationError(
          `La factura Folio ${invoice.folio} no está firmada (estado actual: ${invoice.estado}). Debe estar en SIGNED, PERSISTED o UNKNOWN.`
        );
      }
    }

    const certificate = await this.certificateRepository.findActiveCertificate(
      dto.tenantId
    );

    if (!certificate) {
      throw new NoActiveCertificateError(dto.tenantId);
    }

    const rutEmisor = dto.invoices[0].emisor.rut;
    const rutEnvia = Rut.of(dto.rutEnvia);
    const rutReceptor = dto.rutReceptor
      ? Rut.of(dto.rutReceptor)
      : Rut.of('60803000-K');

    const signedDteXmls = dto.invoices.map((inv) => inv.signedDteXml!);

    const envioDteXml = EnvioDteBuilder.buildAndSign(
      signedDteXmls,
      certificate,
      {
        rutEmisor,
        rutEnvia,
        rutReceptor,
        fchResol: dto.fchResol,
        nroResol: dto.nroResol,
        tipoDte: dto.invoices[0].tipoDte.code
      }
    );

    return {
      envioDteXml,
      totalDtes: dto.invoices.length
    };
  }
}
