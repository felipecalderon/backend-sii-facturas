import { FolioRepository } from '../../domain/folio/ports/folio.repository.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';

export interface AllocateFolioDto {
  tenantId: string;
  tipoDte: number;
  invoice?: Invoice;
}

export interface AllocateFolioResult {
  folio: number;
  tenantId: string;
  tipoDte: number;
  caf: Caf;
  invoice?: Invoice;
}

export class AllocateFolioUseCase {
  constructor(private readonly folioRepository: FolioRepository) {}

  public async execute(dto: AllocateFolioDto): Promise<AllocateFolioResult> {
    if (dto.invoice && dto.invoice.tenantId !== dto.tenantId) {
      throw new TenantMismatchError(dto.tenantId, dto.invoice.tenantId);
    }

    const tipoDteVo = TipoDte.of(dto.tipoDte);
    const { folio, caf } = await this.folioRepository.allocateNextFolio(
      dto.tenantId,
      tipoDteVo
    );

    if (dto.invoice) {
      dto.invoice.assignFolio(folio);
    }

    return {
      folio,
      tenantId: dto.tenantId,
      tipoDte: tipoDteVo.code,
      caf,
      invoice: dto.invoice
    };
  }
}
