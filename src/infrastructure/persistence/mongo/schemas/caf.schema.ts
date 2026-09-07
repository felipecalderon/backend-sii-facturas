import mongoose, { Schema, type Document, type Model, model } from 'mongoose';
const { models } = mongoose;

export interface CafDocument extends Document {
  tenantId: string;
  tipoDte: number;
  rangoDesde: number;
  rangoHasta: number;
  ultimoFolioAsignado: number;
  clavePrivadaPem: string;
  cafXml: string;
  cafHash: string;
  fechaAutorizacion: Date;
  rutEmisor: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const CafSchema = new Schema<CafDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    tipoDte: { type: Number, required: true, index: true },
    rangoDesde: { type: Number, required: true },
    rangoHasta: { type: Number, required: true },
    ultimoFolioAsignado: { type: Number, required: true },
    clavePrivadaPem: { type: String, required: true },
    cafXml: { type: String, required: true },
    cafHash: { type: String, required: true },
    fechaAutorizacion: { type: Date, required: true },
    rutEmisor: { type: String, required: true },
    activo: { type: Boolean, required: true, default: true, index: true }
  },
  {
    timestamps: true,
    collection: 'cafs'
  }
);

CafSchema.index({ tenantId: 1, cafHash: 1 }, { unique: true });
CafSchema.index(
  { tenantId: 1, tipoDte: 1 },
  { unique: true, partialFilterExpression: { activo: true } }
);
CafSchema.index({ tenantId: 1, tipoDte: 1, activo: 1 });

export const getCafModel = (): Model<CafDocument> => {
  return (
    (models.Caf as Model<CafDocument>) || model<CafDocument>('Caf', CafSchema)
  );
};
