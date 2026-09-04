import { Invoice } from '../entities/invoice.entity.js';
import { TipoDte } from '../values/dte-type.vo.js';

export interface InvoiceRepository {
  save(invoice: Invoice): Promise<void>;
  findByFolio(
    tenantId: string,
    tipoDte: TipoDte,
    folio: number
  ): Promise<Invoice | null>;
  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<Invoice | null>;
}
