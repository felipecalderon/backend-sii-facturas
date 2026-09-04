import { Schema, type Document, type Model, model, models } from 'mongoose';

export interface InvoiceItemSubdocument {
  linea: number;
  nombre: string;
  descripcion?: string;
  cantidad: string;
  precioUnitario: string;
  esExento: boolean;
  descuentoPct?: number;
  descuentoMonto?: string;
  currency?: string;
}

export interface InvoiceIssuerSubdocument {
  rut: string;
  razonSocial: string;
  giro: string;
  actividadEconomica: number;
  direccion: string;
  comuna: string;
  ciudad?: string;
  correo?: string;
  telefono?: string;
}

export interface InvoiceReceiverSubdocument {
  rut: string;
  razonSocial: string;
  giro: string;
  direccion: string;
  comuna: string;
  ciudad?: string;
  correo?: string;
  contacto?: string;
}

export interface InvoiceTotalsSubdocument {
  montoNeto: string;
  montoExento: string;
  tasaIva: number;
  montoIva: string;
  montoTotal: string;
  currency: string;
}

export interface InvoiceDocument extends Document {
  tenantId: string;
  tipoDte: number;
  folio?: number;
  fechaEmision: Date;
  emisor: InvoiceIssuerSubdocument;
  receptor: InvoiceReceiverSubdocument;
  items: InvoiceItemSubdocument[];
  totales: InvoiceTotalsSubdocument;
  estado: string;
  idempotencyKey?: string;
  tedXml?: string;
  dteXml?: string;
  signedDteXml?: string;
  trackId?: string;
  glosaRechazo?: string;
  observaciones?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const InvoiceSchema = new Schema<InvoiceDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    tipoDte: { type: Number, required: true, index: true },
    folio: { type: Number, required: false },
    fechaEmision: { type: Date, required: true },
    emisor: {
      rut: { type: String, required: true },
      razonSocial: { type: String, required: true },
      giro: { type: String, required: true },
      actividadEconomica: { type: Number, required: true },
      direccion: { type: String, required: true },
      comuna: { type: String, required: true },
      ciudad: { type: String, required: false },
      correo: { type: String, required: false },
      telefono: { type: String, required: false }
    },
    receptor: {
      rut: { type: String, required: true },
      razonSocial: { type: String, required: true },
      giro: { type: String, required: true },
      direccion: { type: String, required: true },
      comuna: { type: String, required: true },
      ciudad: { type: String, required: false },
      correo: { type: String, required: false },
      contacto: { type: String, required: false }
    },
    items: [
      {
        linea: { type: Number, required: true },
        nombre: { type: String, required: true },
        descripcion: { type: String, required: false },
        cantidad: { type: String, required: true },
        precioUnitario: { type: String, required: true },
        esExento: { type: Boolean, required: true, default: false },
        descuentoPct: { type: Number, required: false },
        descuentoMonto: { type: String, required: false },
        currency: { type: String, required: false, default: 'CLP' }
      }
    ],
    totales: {
      montoNeto: { type: String, required: true },
      montoExento: { type: String, required: true },
      tasaIva: { type: Number, required: true },
      montoIva: { type: String, required: true },
      montoTotal: { type: String, required: true },
      currency: { type: String, required: true, default: 'CLP' }
    },
    estado: { type: String, required: true, index: true },
    idempotencyKey: { type: String, required: false },
    tedXml: { type: String, required: false },
    dteXml: { type: String, required: false },
    signedDteXml: { type: String, required: false },
    trackId: { type: String, required: false },
    glosaRechazo: { type: String, required: false },
    observaciones: { type: [String], required: false }
  },
  {
    timestamps: true,
    collection: 'invoices'
  }
);

// Índices requeridos
InvoiceSchema.index(
  { tenantId: 1, tipoDte: 1, folio: 1 },
  { unique: true, sparse: true }
);

InvoiceSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true }
);

InvoiceSchema.index({ tenantId: 1, estado: 1 });

export const getInvoiceModel = (): Model<InvoiceDocument> => {
  return (
    (models.Invoice as Model<InvoiceDocument>) ||
    model<InvoiceDocument>('Invoice', InvoiceSchema)
  );
};
