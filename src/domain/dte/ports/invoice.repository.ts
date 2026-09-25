import { Invoice, InvoiceStatus } from '../entities/invoice.entity.js';
import { TipoDte } from '../values/dte-type.vo.js';

export interface FindInvoicesFilters {
  tenantId: string;
  tipoDte?: TipoDte;
  estado?: InvoiceStatus;
  desde?: Date;
  hasta?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

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
  findMany(filters: FindInvoicesFilters): Promise<PaginatedResult<Invoice>>;
}

export const INVOICE_REPOSITORY_TOKEN = 'INVOICE_REPOSITORY';
