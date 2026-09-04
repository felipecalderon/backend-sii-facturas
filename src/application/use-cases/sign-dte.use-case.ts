import { CertificateRepository } from '../../domain/certificate/ports/certificate.repository.js';
import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import { DteSigner } from '../../infrastructure/crypto/dte-signer.js';
import { NoActiveCertificateError } from '../../domain/certificate/errors/certificate-domain.error.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export interface SignDteDto {
  tenantId: string;
  invoice: Invoice;
}

export interface SignDteResult {
  invoice: Invoice;
  signedDteXml: string;
}

export class SignDteUseCase {
  constructor(private readonly certificateRepository: CertificateRepository) {}

  public async execute(dto: SignDteDto): Promise<SignDteResult> {
    if (dto.invoice.tenantId !== dto.tenantId) {
      throw new TenantMismatchError(dto.tenantId, dto.invoice.tenantId);
    }

    if (dto.invoice.estado !== InvoiceStatus.BUILT) {
      throw new FiscalValidationError(
        `No se puede firmar una factura en estado ${dto.invoice.estado}. Debe estar en BUILT.`
      );
    }

    if (!dto.invoice.dteXml) {
      throw new FiscalValidationError(
        'La factura no posee el XML DTE generado'
      );
    }

    const certificate = await this.certificateRepository.findActiveCertificate(
      dto.tenantId
    );

    if (!certificate) {
      throw new NoActiveCertificateError(dto.tenantId);
    }

    const docId = `F${dto.invoice.folio}T${dto.invoice.tipoDte.code}`;
    const signedDteXml = DteSigner.sign(dto.invoice.dteXml, certificate, docId);

    dto.invoice.sign(signedDteXml);

    return {
      invoice: dto.invoice,
      signedDteXml
    };
  }
}
