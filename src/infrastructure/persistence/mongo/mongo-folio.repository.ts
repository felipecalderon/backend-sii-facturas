import crypto from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  FolioRepository,
  FolioStatus,
  SaveCafResult
} from '../../../domain/folio/ports/folio.repository.js';
import { Caf } from '../../../domain/folio/entities/caf.entity.js';
import { TipoDte } from '../../../domain/dte/values/dte-type.vo.js';
import { Rut } from '../../../domain/shared/rut.vo.js';
import {
  FoliosExhaustedError,
  NoActiveCafError
} from '../../../domain/folio/errors/folio-domain.error.js';
import { CafDocument, getCafModel } from './schemas/caf.schema.js';

@Injectable()
export class MongoFolioRepository implements FolioRepository {
  private readonly cafModel: Model<CafDocument>;

  constructor(
    @Optional()
    @InjectModel('Caf')
    customModel?: Model<CafDocument>
  ) {
    this.cafModel = customModel ?? getCafModel();
  }

  public async saveCaf(caf: Caf): Promise<SaveCafResult> {
    const document = this.toDocument(caf);
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const createdDoc = await this.cafModel.create(document);
        return { caf: this.toDomain(createdDoc), created: true };
      } catch (error: unknown) {
        lastError = error;

        if (!MongoFolioRepository.isDuplicateKeyError(error)) {
          throw error;
        }

        // Si ya existe el mismo CAF para el tenant, la reimportación es idempotente:
        // no se modifica estado ni se reinicia la secuencia de folios.
        const existing = await this.cafModel.findOne({
          tenantId: caf.tenantId,
          cafHash: document.cafHash
        });
        if (existing) {
          return { caf: this.toDomain(existing), created: false };
        }

        // Conflicto por el índice único de CAF activo: desactivar el previo y reintentar.
        if (caf.activo) {
          await this.cafModel.updateMany(
            {
              tenantId: caf.tenantId,
              tipoDte: caf.tipoDte.code,
              activo: true
            },
            { $set: { activo: false } }
          );
          continue;
        }

        throw error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error('No se pudo registrar el CAF después de reintentos');
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
        returnDocument: 'after'
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

    // Si no encontró coincidencia, determinar la causa: sin CAF registrado o folios agotados
    const anyCaf = await this.cafModel
      .findOne(
        {
          tenantId,
          tipoDte: tipoDte.code
        },
        { rangoHasta: 1 }
      )
      .sort({ rangoHasta: -1, createdAt: -1 });

    if (!anyCaf) {
      throw new NoActiveCafError(tenantId, tipoDte.code);
    }

    throw new FoliosExhaustedError(tenantId, tipoDte.code, anyCaf.rangoHasta);
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

  private toDocument(caf: Caf) {
    return {
      tenantId: caf.tenantId,
      tipoDte: caf.tipoDte.code,
      rangoDesde: caf.rangoDesde,
      rangoHasta: caf.rangoHasta,
      ultimoFolioAsignado: caf.ultimoFolioAsignado,
      clavePrivadaPem: caf.clavePrivadaPem,
      cafXml: caf.cafXml,
      cafHash: MongoFolioRepository.computeCafHash(caf.cafXml),
      fechaAutorizacion: caf.fechaAutorizacion,
      rutEmisor: caf.rutEmisor.toCanonical(),
      activo: caf.activo
    };
  }

  private static computeCafHash(cafXml: string): string {
    const normalizedXml = cafXml.trim().replace(/\r\n/g, '\n');
    return crypto.createHash('sha256').update(normalizedXml).digest('hex');
  }

  private static isDuplicateKeyError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const candidate = error as { code?: number; message?: string };
    return (
      candidate.code === 11000 ||
      candidate.code === 11001 ||
      (typeof candidate.message === 'string' &&
        candidate.message.includes('E11000'))
    );
  }
}
