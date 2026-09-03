import type { Model } from 'mongoose';
import {
  FolioRepository,
  FolioStatus
} from '../../../domain/folio/ports/folio.repository.js';
import { Caf } from '../../../domain/folio/entities/caf.entity.js';
import { TipoDte } from '../../../domain/dte/values/dte-type.vo.js';
import { Rut } from '../../../domain/shared/rut.vo.js';
import {
  FoliosExhaustedError,
  NoActiveCafError
} from '../../../domain/folio/errors/folio-domain.error.js';
import { CafDocument, getCafModel } from './schemas/caf.schema.js';

export class MongoFolioRepository implements FolioRepository {
  private readonly cafModel: Model<CafDocument>;

  constructor(customModel?: Model<CafDocument>) {
    this.cafModel = customModel ?? getCafModel();
  }

  public async saveCaf(caf: Caf): Promise<void> {
    // Desactivar CAFs previos del mismo tenant y tipoDte si el nuevo está activo
    if (caf.activo) {
      await this.cafModel.updateMany(
        { tenantId: caf.tenantId, tipoDte: caf.tipoDte.code, activo: true },
        { $set: { activo: false } }
      );
    }

    await this.cafModel.create({
      tenantId: caf.tenantId,
      tipoDte: caf.tipoDte.code,
      rangoDesde: caf.rangoDesde,
      rangoHasta: caf.rangoHasta,
      ultimoFolioAsignado: caf.ultimoFolioAsignado,
      clavePrivadaPem: caf.clavePrivadaPem,
      cafXml: caf.cafXml,
      fechaAutorizacion: caf.fechaAutorizacion,
      rutEmisor: caf.rutEmisor.toCanonical(),
      activo: caf.activo
    });
  }

  public async findActiveCaf(
    tenantId: string,
    tipoDte: TipoDte
  ): Promise<Caf | null> {
    const doc = await this.cafModel
      .findOne({
        tenantId,
        tipoDte: tipoDte.code,
        activo: true
      })
      .exec();

    if (!doc) {
      return null;
    }

    return this.toDomain(doc);
  }

  public async allocateNextFolio(
    tenantId: string,
    tipoDte: TipoDte
  ): Promise<{ folio: number; caf: Caf }> {
    // Asignación atómica mediante findOneAndUpdate con $expr y $inc
    const updatedDoc = await this.cafModel.findOneAndUpdate(
      {
        tenantId,
        tipoDte: tipoDte.code,
        activo: true,
        $expr: { $lt: ['$ultimoFolioAsignado', '$rangoHasta'] }
      },
      {
        $inc: { ultimoFolioAsignado: 1 }
      },
      {
        new: true
      }
    );

    if (updatedDoc) {
      // Si el nuevo folio alcanzó el máximo, desactivar el CAF para futuras asignaciones
      if (updatedDoc.ultimoFolioAsignado >= updatedDoc.rangoHasta) {
        await this.cafModel.updateOne(
          { _id: updatedDoc._id },
          { $set: { activo: false } }
        );
        updatedDoc.activo = false;
      }
      return {
        folio: updatedDoc.ultimoFolioAsignado,
        caf: this.toDomain(updatedDoc)
      };
    }

    // Si no encontró coincidencia, determinar la causa (sin CAF o folios agotados)
    const activeCaf = await this.cafModel.findOne({
      tenantId,
      tipoDte: tipoDte.code,
      activo: true
    });

    if (!activeCaf) {
      throw new NoActiveCafError(tenantId, tipoDte.code);
    }

    throw new FoliosExhaustedError(
      tenantId,
      tipoDte.code,
      activeCaf.rangoHasta
    );
  }

  public async getFolioStatus(
    tenantId: string,
    tipoDte: TipoDte
  ): Promise<FolioStatus | null> {
    const doc = await this.cafModel.findOne({
      tenantId,
      tipoDte: tipoDte.code,
      activo: true
    });

    if (!doc) {
      return null;
    }

    const disponibles = Math.max(0, doc.rangoHasta - doc.ultimoFolioAsignado);
    return {
      rangoDesde: doc.rangoDesde,
      rangoHasta: doc.rangoHasta,
      ultimoAsignado: doc.ultimoFolioAsignado,
      disponibles,
      activo: doc.activo
    };
  }

  private toDomain(doc: CafDocument): Caf {
    return Caf.create({
      id: doc._id.toString(),
      tenantId: doc.tenantId,
      tipoDte: TipoDte.of(doc.tipoDte),
      rangoDesde: doc.rangoDesde,
      rangoHasta: doc.rangoHasta,
      ultimoFolioAsignado: doc.ultimoFolioAsignado,
      clavePrivadaPem: doc.clavePrivadaPem,
      cafXml: doc.cafXml,
      fechaAutorizacion: doc.fechaAutorizacion,
      rutEmisor: Rut.of(doc.rutEmisor),
      activo: doc.activo
    });
  }
}
