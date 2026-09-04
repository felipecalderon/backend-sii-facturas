import { Issuer } from './issuer.entity.js';
import { Receiver } from './receiver.entity.js';
import { InvoiceItem } from './invoice-item.entity.js';
import { InvoiceTotals } from '../values/invoice-totals.vo.js';
import { TipoDte } from '../values/dte-type.vo.js';
import { FiscalValidationError } from '../errors/fiscal-domain.error.js';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  FOLIO_ASSIGNED = 'FOLIO_ASSIGNED',
  BUILT = 'BUILT',
  STAMPED = 'STAMPED',
  SIGNED = 'SIGNED',
  PERSISTED = 'PERSISTED',
  SUBMITTED = 'SUBMITTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  OBSERVED = 'OBSERVED',
  UNKNOWN = 'UNKNOWN'
}

export interface CreateInvoiceDraftProps {
  tenantId: string;
  fechaEmision: Date;
  emisor: Issuer;
  receptor: Receiver;
  items: InvoiceItem[];
  tasaIva?: number;
  idempotencyKey?: string;
}

export interface InvoiceProps {
  tenantId: string;
  tipoDte: TipoDte;
  folio?: number;
  fechaEmision: Date;
  emisor: Issuer;
  receptor: Receiver;
  items: InvoiceItem[];
  totales: InvoiceTotals;
  estado: InvoiceStatus;
  idempotencyKey?: string;
  tedXml?: string;
  dteXml?: string;
  signedDteXml?: string;
}

export class Invoice {
  public readonly tenantId: string;
  public readonly tipoDte: TipoDte;
  private _folio?: number;
  public readonly fechaEmision: Date;
  public readonly emisor: Issuer;
  public readonly receptor: Receiver;
  public readonly items: readonly InvoiceItem[];
  public readonly totales: InvoiceTotals;
  private _estado: InvoiceStatus;
  private _tedXml?: string;
  private _dteXml?: string;
  private _signedDteXml?: string;
  public readonly idempotencyKey?: string;

  private constructor(props: InvoiceProps) {
    this.tenantId = props.tenantId;
    this.tipoDte = props.tipoDte;
    this._folio = props.folio;
    this.fechaEmision = props.fechaEmision;
    this.emisor = props.emisor;
    this.receptor = props.receptor;
    this.items = Object.freeze([...props.items]);
    this.totales = props.totales;
    this._estado = props.estado;
    this._tedXml = props.tedXml;
    this._dteXml = props.dteXml;
    this._signedDteXml = props.signedDteXml;
    this.idempotencyKey = props.idempotencyKey;
  }

  public static createDraft(props: CreateInvoiceDraftProps): Invoice {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new FiscalValidationError(
        'El tenantId es obligatorio para toda operación'
      );
    }
    if (!props.emisor) {
      throw new FiscalValidationError('Los datos del emisor son obligatorios');
    }
    if (!props.receptor) {
      throw new FiscalValidationError(
        'Los datos del receptor son obligatorios'
      );
    }
    if (!props.items || props.items.length === 0) {
      throw new FiscalValidationError(
        'Una factura debe contener al menos un ítem'
      );
    }

    // Validar líneas correlativas
    const lineNumbers = props.items.map((i) => i.linea);
    const uniqueLines = new Set(lineNumbers);
    if (uniqueLines.size !== lineNumbers.length) {
      throw new FiscalValidationError(
        'Existen números de línea duplicados en el detalle de la factura'
      );
    }

    const calculatedTotals = InvoiceTotals.calculateFromItems(
      props.items,
      props.tasaIva ?? 19,
      props.items[0].precioUnitario.currency
    );

    return new Invoice({
      tenantId: props.tenantId,
      tipoDte: TipoDte.facturaElectronica(),
      fechaEmision: props.fechaEmision,
      emisor: props.emisor,
      receptor: props.receptor,
      items: props.items,
      totales: calculatedTotals,
      estado: InvoiceStatus.DRAFT,
      idempotencyKey: props.idempotencyKey
    });
  }

  public assignFolio(folio: number): void {
    if (this._estado !== InvoiceStatus.DRAFT) {
      throw new FiscalValidationError(
        `No se puede asignar folio a una factura en estado ${this._estado}. Debe estar en DRAFT.`
      );
    }
    if (!Number.isInteger(folio) || folio <= 0) {
      throw new FiscalValidationError(
        `Folio fiscal inválido: ${folio}. Debe ser un entero positivo.`
      );
    }

    this._folio = folio;
    this._estado = InvoiceStatus.FOLIO_ASSIGNED;
  }

  public stampTed(tedXml: string): void {
    if (this._estado !== InvoiceStatus.FOLIO_ASSIGNED) {
      throw new FiscalValidationError(
        `No se puede timbrar una factura en estado ${this._estado}. Debe estar en FOLIO_ASSIGNED.`
      );
    }
    if (!this._folio || this._folio <= 0) {
      throw new FiscalValidationError(
        'No se puede timbrar una factura sin un folio asignado válido.'
      );
    }
    if (!tedXml || !tedXml.includes('<TED')) {
      throw new FiscalValidationError('El XML de timbre TED es inválido.');
    }

    this._tedXml = tedXml;
    this._estado = InvoiceStatus.STAMPED;
  }

  public setDteXml(dteXml: string): void {
    if (this._estado !== InvoiceStatus.STAMPED) {
      throw new FiscalValidationError(
        `No se puede asociar XML DTE a una factura en estado ${this._estado}. Debe estar en STAMPED.`
      );
    }
    if (!this._tedXml) {
      throw new FiscalValidationError(
        'No se puede generar DTE sin un timbre TED asociado.'
      );
    }
    if (!dteXml || !dteXml.includes('<DTE')) {
      throw new FiscalValidationError('El contenido XML del DTE es inválido.');
    }

    this._dteXml = dteXml;
    this._estado = InvoiceStatus.BUILT;
  }

  public sign(signedDteXml: string): void {
    if (this._estado !== InvoiceStatus.BUILT) {
      throw new FiscalValidationError(
        `No se puede firmar una factura en estado ${this._estado}. Debe estar en BUILT.`
      );
    }
    if (!signedDteXml || !signedDteXml.includes('<Signature')) {
      throw new FiscalValidationError(
        'El XML firmado debe incluir la firma digital <Signature>.'
      );
    }

    this._signedDteXml = signedDteXml;
    this._estado = InvoiceStatus.SIGNED;
  }

  public get folio(): number | undefined {
    return this._folio;
  }

  public get estado(): InvoiceStatus {
    return this._estado;
  }

  public get tedXml(): string | undefined {
    return this._tedXml;
  }

  public get dteXml(): string | undefined {
    return this._dteXml;
  }

  public get signedDteXml(): string | undefined {
    return this._signedDteXml;
  }
}
