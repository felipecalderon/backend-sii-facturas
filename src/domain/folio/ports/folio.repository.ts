import { Caf } from '../entities/caf.entity.js';
import { TipoDte } from '../../dte/values/dte-type.vo.js';

export interface FolioStatus {
  rangoDesde: number;
  rangoHasta: number;
  ultimoAsignado: number;
  disponibles: number;
  activo: boolean;
}

export interface FolioRepository {
  saveCaf(caf: Caf): Promise<void>;
  findActiveCaf(tenantId: string, tipoDte: TipoDte): Promise<Caf | null>;
  allocateNextFolio(
    tenantId: string,
    tipoDte: TipoDte
  ): Promise<{ folio: number; caf: Caf }>;
  getFolioStatus(
    tenantId: string,
    tipoDte: TipoDte
  ): Promise<FolioStatus | null>;
}

export const FOLIO_REPOSITORY_TOKEN = 'FOLIO_REPOSITORY';
