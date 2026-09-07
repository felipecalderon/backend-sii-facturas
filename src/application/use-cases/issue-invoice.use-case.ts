import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { FolioRepository } from '../../domain/folio/ports/folio.repository.js';
import { CertificateRepository } from '../../domain/certificate/ports/certificate.repository.js';
import { InvoiceRepository } from '../../domain/dte/ports/invoice.repository.js';
import { StampInvoiceUseCase } from './stamp-invoice.use-case.js';
import { BuildDteXmlUseCase } from './build-dte-xml.use-case.js';
import { SignDteUseCase } from './sign-dte.use-case.js';
import { CreateEnvioDteUseCase } from './create-envio-dte.use-case.js';
import { SubmitEnvioDteUseCase } from './submit-envio-dte.use-case.js';
import { SiiEnvironment } from '../../domain/sii/values/sii-domain.types.js';
import { NoActiveCertificateError } from '../../domain/certificate/errors/certificate-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import { SiiConnectionError } from '../../domain/sii/errors/sii-domain.error.js';

export interface IssueInvoiceDto {
  tenantId: string;
  fechaEmision?: Date;
  emisor: Issuer;
  receptor: Receiver;
  items: InvoiceItem[];
  tasaIva?: number;
  idempotencyKey?: string;
  environment?: SiiEnvironment;
  validateXsd?: boolean;
}

export interface IssueInvoiceResult {
  invoice: Invoice;
  folio: number;
  trackId: string;
  estado: InvoiceStatus;
  isDuplicate: boolean;
}

export class IssueInvoiceUseCase {
  constructor(
    private readonly folioRepository: FolioRepository,
    private readonly certificateRepository: CertificateRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly stampInvoiceUseCase: StampInvoiceUseCase,
    private readonly buildDteXmlUseCase: BuildDteXmlUseCase,
    private readonly signDteUseCase: SignDteUseCase,
    private readonly createEnvioDteUseCase: CreateEnvioDteUseCase,
    private readonly submitEnvioDteUseCase: SubmitEnvioDteUseCase
  ) {}

  public async execute(dto: IssueInvoiceDto): Promise<IssueInvoiceResult> {
    if (!dto.tenantId || dto.tenantId.trim().length === 0) {
      throw new FiscalValidationError(
        'El tenantId es obligatorio para emitir una factura'
      );
    }

    const fchResol = dto.emisor.fchResol;
    const nroResol = dto.emisor.nroResol;
    if (fchResol === undefined || nroResol === undefined) {
      throw new FiscalValidationError(
        'El emisor debe tener configurados fchResol y nroResol (resolución de autorización de facturación electrónica) antes de emitir. Configúrelos vía PUT /tenants/issuer.'
      );
    }

    const env = dto.environment ?? 'CERTIFICATION';

    // 1. Control de idempotencia
    if (dto.idempotencyKey && dto.idempotencyKey.trim().length > 0) {
      const existing = await this.invoiceRepository.findByIdempotencyKey(
        dto.tenantId,
        dto.idempotencyKey.trim()
      );

      if (existing) {
        // Si ya fue enviada o procesada, retornar el resultado sin consumir nuevo folio ni reenviar
        const terminalOrSubmittedStates: InvoiceStatus[] = [
          InvoiceStatus.SUBMITTED,
          InvoiceStatus.ACCEPTED,
          InvoiceStatus.OBSERVED,
          InvoiceStatus.REJECTED
        ];

        if (terminalOrSubmittedStates.includes(existing.estado)) {
          return {
            invoice: existing,
            folio: existing.folio!,
            trackId: existing.trackId ?? '',
            estado: existing.estado,
            isDuplicate: true
          };
        }

        // Si quedó en PERSISTED o UNKNOWN por falla previa, reintentar transmisión sin consumir otro folio
        if (
          existing.estado === InvoiceStatus.PERSISTED ||
          existing.estado === InvoiceStatus.UNKNOWN
        ) {
          return this.transmitInvoice(
            existing,
            dto,
            env,
            true,
            fchResol,
            nroResol
          );
        }
      }
    }

    // 2. Crear borrador del DTE
    const invoice = Invoice.createDraft({
      tenantId: dto.tenantId,
      fechaEmision: dto.fechaEmision ?? new Date(),
      emisor: dto.emisor,
      receptor: dto.receptor,
      items: dto.items,
      tasaIva: dto.tasaIva,
      idempotencyKey: dto.idempotencyKey?.trim()
    });

    // 3. Asignar folio atómicamente desde el CAF activo
    const allocation = await this.folioRepository.allocateNextFolio(
      dto.tenantId,
      invoice.tipoDte
    );
    invoice.assignFolio(allocation.folio);

    // 4. Timbrar el DTE (TED firmado con clave privada del CAF)
    await this.stampInvoiceUseCase.execute({
      tenantId: dto.tenantId,
      invoice,
      caf: allocation.caf
    });

    // 5. Generar XML canónico del DTE y validar contra XSD
    await this.buildDteXmlUseCase.execute({
      tenantId: dto.tenantId,
      invoice,
      validateXsd: dto.validateXsd
    });

    // 6. Firmar digitalmente el DTE con certificado digital del tenant (XMLDSig)
    await this.signDteUseCase.execute({
      tenantId: dto.tenantId,
      invoice
    });

    // 7. Principio Fiscal No Negociable #4: Persistencia antes de transmisión
    invoice.markPersisted();
    await this.invoiceRepository.save(invoice);

    // 8. Transmitir el documento al SII
    return this.transmitInvoice(invoice, dto, env, false, fchResol, nroResol);
  }

  private async transmitInvoice(
    invoice: Invoice,
    dto: IssueInvoiceDto,
    env: SiiEnvironment,
    isDuplicate: boolean,
    fchResol: string,
    nroResol: number
  ): Promise<IssueInvoiceResult> {
    // El RUT remitente del EnvioDTE siempre es el titular del certificado activo
    const activeCert = await this.certificateRepository.findActiveCertificate(
      dto.tenantId
    );
    if (!activeCert) {
      throw new NoActiveCertificateError(dto.tenantId);
    }
    const rutSender = activeCert.rutTitular;

    // Generar y firmar el sobre EnvioDTE
    const envio = await this.createEnvioDteUseCase.execute({
      tenantId: dto.tenantId,
      invoices: [invoice],
      rutEnvia: rutSender.toCanonical(),
      fchResol,
      nroResol
    });

    // Transmitir al SII
    try {
      const submitResult = await this.submitEnvioDteUseCase.execute({
        tenantId: dto.tenantId,
        invoices: [invoice],
        envioDteXml: envio.envioDteXml,
        rutSender,
        environment: env
      });

      // Actualizar estado en persistencia a SUBMITTED con el trackId
      await this.invoiceRepository.save(invoice);

      return {
        invoice,
        folio: invoice.folio!,
        trackId: submitResult.trackId,
        estado: invoice.estado,
        isDuplicate
      };
    } catch (err: unknown) {
      // Si ocurrió una falla de conexión / timeout, asegurar que la factura transicione a UNKNOWN
      if (
        err instanceof SiiConnectionError &&
        invoice.estado !== InvoiceStatus.UNKNOWN
      ) {
        invoice.markUnknown(err.message);
      }
      // Persistimos el estado UNKNOWN para permitir recuperación sin doble asignación de folio
      await this.invoiceRepository.save(invoice);
      throw err;
    }
  }
}
