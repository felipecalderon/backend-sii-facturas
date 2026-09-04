import mongoose, { Schema, type Document, type Model, model } from 'mongoose';
const { models } = mongoose;

export interface CertificateDocument extends Document {
  tenantId: string;
  encryptedBinary: string;
  binaryIv: string;
  binaryAuthTag: string;
  encryptedPassword: string;
  passwordIv: string;
  passwordAuthTag: string;
  rutTitular: string;
  validFrom: Date;
  validTo: Date;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const CertificateSchema = new Schema<CertificateDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    encryptedBinary: { type: String, required: true },
    binaryIv: { type: String, required: true },
    binaryAuthTag: { type: String, required: true },
    encryptedPassword: { type: String, required: true },
    passwordIv: { type: String, required: true },
    passwordAuthTag: { type: String, required: true },
    rutTitular: { type: String, required: true },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    activo: { type: Boolean, required: true, default: true, index: true }
  },
  {
    timestamps: true,
    collection: 'certificates'
  }
);

CertificateSchema.index({ tenantId: 1, activo: 1 });

export const getCertificateModel = (): Model<CertificateDocument> => {
  return (
    (models.Certificate as Model<CertificateDocument>) ||
    model<CertificateDocument>('Certificate', CertificateSchema)
  );
};
