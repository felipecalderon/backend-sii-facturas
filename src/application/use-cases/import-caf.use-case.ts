import { FolioRepository } from '../../domain/folio/ports/folio.repository.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { CafXmlParser } from '../../infrastructure/caf/caf-xml-parser.js';

export interface ImportCafDto {
  tenantId: string;
  xmlContent: string;
}

export interface ImportCafResult {
  tenantId: string;
  tipoDte: number;
  rangoDesde: number;
  rangoHasta: number;
  fechaAutorizacion: Date;
  rutEmisor: string;
  totalFolios: number;
  created: boolean;
}

export class ImportCafUseCase {
  constructor(private readonly folioRepository: FolioRepository) {}

  public async execute(dto: ImportCafDto): Promise<ImportCafResult> {
    const parsed = CafXmlParser.parse(dto.xmlContent);

    const caf = Caf.create({
      tenantId: dto.tenantId,
      tipoDte: parsed.tipoDte,
      rangoDesde: parsed.rangoDesde,
      rangoHasta: parsed.rangoHasta,
      clavePrivadaPem: parsed.clavePrivadaPem,
      cafXml: parsed.cafXml,
      fechaAutorizacion: parsed.fechaAutorizacion,
      rutEmisor: parsed.rutEmisor,
      activo: true
    });

    const saved = await this.folioRepository.saveCaf(caf);

    return {
      tenantId: saved.caf.tenantId,
      tipoDte: saved.caf.tipoDte.code,
      rangoDesde: saved.caf.rangoDesde,
      rangoHasta: saved.caf.rangoHasta,
      fechaAutorizacion: saved.caf.fechaAutorizacion,
      rutEmisor: saved.caf.rutEmisor.toCanonical(),
      totalFolios: saved.caf.rangoHasta - saved.caf.rangoDesde + 1,
      created: saved.created
    };
  }
}
