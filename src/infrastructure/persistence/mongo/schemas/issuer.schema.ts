import mongoose, { Schema, type Document, type Model, model } from 'mongoose';
const { models } = mongoose;

export interface IssuerDocument extends Document {
  tenantId: string;
  rut: string;
  razonSocial: string;
  giro: string;
  actividadEconomica: number;
  direccion: string;
  comuna: string;
  ciudad?: string;
  correo?: string;
  telefono?: string;
  fchResol?: string;
  nroResol?: number;
  createdAt: Date;
  updatedAt: Date;
}

export const IssuerSchema = new Schema<IssuerDocument>(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    rut: { type: String, required: true },
    razonSocial: { type: String, required: true },
    giro: { type: String, required: true },
    actividadEconomica: { type: Number, required: true },
    direccion: { type: String, required: true },
    comuna: { type: String, required: true },
    ciudad: { type: String, required: false },
    correo: { type: String, required: false },
    telefono: { type: String, required: false },
    fchResol: { type: String, required: false },
    nroResol: { type: Number, required: false }
  },
  {
    timestamps: true,
    collection: 'issuers'
  }
);

export const getIssuerModel = (): Model<IssuerDocument> => {
  return (
    (models.Issuer as Model<IssuerDocument>) ||
    model<IssuerDocument>('Issuer', IssuerSchema)
  );
};
