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

  public get folio(): number | undefined {
    return this._folio;
  }

  public get estado(): InvoiceStatus {
    return this._estado;
  }
}
