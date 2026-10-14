import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import { AuthenticateSiiUseCase } from './authenticate-sii.use-case.js';
import { SiiGateway } from '../../domain/sii/ports/sii-gateway.port.js';
import { SiiEnvironment } from '../../domain/sii/values/sii-domain.types.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import { SiiConnectionError } from '../../domain/sii/errors/sii-domain.error.js';
import { DteSigner } from '../../infrastructure/crypto/dte-signer.js';
import { EnvioDteBuilder } from '../../infrastructure/xml/envio-dte-builder.js';
import { XsdValidator } from '../../infrastructure/xml/xsd-validator.js';

export interface SubmitEnvioDteDto {
  tenantId: string;
  invoices: Invoice[];
  envioDteXml: string;
  rutSender: Rut;
  environment?: SiiEnvironment;
}

export interface SubmitEnvioDteResult {
  trackId: string;
  environment: SiiEnvironment;
  invoices: Invoice[];
}

export class SubmitEnvioDteUseCase {
  constructor(
    private readonly authenticateSiiUseCase: AuthenticateSiiUseCase,
    private readonly siiGateway: SiiGateway
  ) {}

  public async execute(dto: SubmitEnvioDteDto): Promise<SubmitEnvioDteResult> {
    if (!dto.invoices || dto.invoices.length === 0) {
      throw new FiscalValidationError(
        'Se requiere al menos una factura para enviar al SII'
      );
    }

    if (!dto.envioDteXml || !dto.envioDteXml.includes('<EnvioDTE')) {
      throw new FiscalValidationError(
        'El XML del EnvioDTE es obligatorio y debe ser válido'
      );
    }

    for (const inv of dto.invoices) {
      if (inv.tenantId !== dto.tenantId) {
        throw new TenantMismatchError(dto.tenantId, inv.tenantId);
      }
      if (
        inv.estado !== InvoiceStatus.SIGNED &&
        inv.estado !== InvoiceStatus.PERSISTED &&
        inv.estado !== InvoiceStatus.UNKNOWN
      ) {
        throw new FiscalValidationError(
          `La factura Folio ${inv.folio} está en estado ${inv.estado}. Debe estar en SIGNED, PERSISTED o UNKNOWN para envío.`
        );
      }
    }

    const xsdValidation = await XsdValidator.validateEnvioDte(dto.envioDteXml);
    if (!xsdValidation.isValid) {
      const details = xsdValidation.errors.join('; ');
      throw new FiscalValidationError(
        `El EnvioDTE no cumple el esquema SII${details ? `: ${details}` : ''}`
      );
    }

    const dteCount =
      dto.envioDteXml.match(/<(?:[A-Za-z_][\w.-]*:)?DTE(?=[\s>])/g)?.length ??
      0;
    if (dteCount !== dto.invoices.length) {
      throw new FiscalValidationError(
        `El EnvioDTE contiene ${dteCount} DTE, pero se recibieron ${dto.invoices.length} facturas`
      );
    }

    const referenceIds = dto.invoices.map((invoice) => {
      const folio = invoice.folio;
      if (!folio || folio <= 0) {
        throw new FiscalValidationError(
          'Todas las facturas deben tener un folio válido antes del envío'
        );
      }
      return `F${folio}T${invoice.tipoDte.code}`;
    });
    if (new Set(referenceIds).size !== referenceIds.length) {
      throw new FiscalValidationError(
        'El envío contiene facturas con referencias de Documento duplicadas'
      );
    }

    for (const referenceId of referenceIds) {
      if (!DteSigner.verify(dto.envioDteXml, referenceId)) {
        throw new FiscalValidationError(
          `El DTE con referencia ${referenceId} no tiene una firma XMLDSig válida`
        );
      }
    }
    if (!EnvioDteBuilder.verify(dto.envioDteXml)) {
      throw new FiscalValidationError(
        'La firma XMLDSig del SetDTE no es válida'
      );
    }

    const firstInvoice = dto.invoices[0];
    const rutCompany = firstInvoice.emisor.rut;
    const env = dto.environment ?? 'CERTIFICATION';

    // 1. Obtener token de sesión activo (usa caché si está disponible)
    const auth = await this.authenticateSiiUseCase.execute({
      tenantId: dto.tenantId,
      environment: env
    });

    // 2. Transmitir el EnvioDTE
    try {
      const sendResult = await this.siiGateway.sendDte({
        env,
        token: auth.token,
        rutSender: dto.rutSender,
        rutCompany,
        envioDteXml: dto.envioDteXml,
        dteReferenceIds: referenceIds
      });

      // 3. Transicionar facturas a SUBMITTED
      for (const inv of dto.invoices) {
        inv.markSubmitted(sendResult.trackId);
      }

      return {
        trackId: sendResult.trackId,
        environment: env,
        invoices: dto.invoices
      };
    } catch (err: unknown) {
      // Regla de incertidumbre: si hay fallo de conexión o timeout, el documento no se rechaza,
      // pasa a estado UNKNOWN para reconciliación posterior sin duplicar folios.
      if (err instanceof SiiConnectionError) {
        for (const inv of dto.invoices) {
          inv.markUnknown(err.message);
        }
      }
      throw err;
    }
  }
}
