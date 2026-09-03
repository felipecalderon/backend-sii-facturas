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

    await this.folioRepository.saveCaf(caf);

    return {
      tenantId: caf.tenantId,
      tipoDte: caf.tipoDte.code,
      rangoDesde: caf.rangoDesde,
      rangoHasta: caf.rangoHasta,
      fechaAutorizacion: caf.fechaAutorizacion,
      rutEmisor: caf.rutEmisor.toCanonical(),
      totalFolios: caf.rangoHasta - caf.rangoDesde + 1
    };
  }
}
