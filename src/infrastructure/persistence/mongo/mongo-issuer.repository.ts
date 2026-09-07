import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { IssuerRepository } from '../../../domain/dte/ports/issuer.repository.js';
import { Issuer } from '../../../domain/dte/entities/issuer.entity.js';
import { Rut } from '../../../domain/shared/rut.vo.js';
import { IssuerDocument, getIssuerModel } from './schemas/issuer.schema.js';

@Injectable()
export class MongoIssuerRepository implements IssuerRepository {
  private readonly issuerModel: Model<IssuerDocument>;

  constructor(
    @Optional()
    @InjectModel('Issuer')
    customModel?: Model<IssuerDocument>
  ) {
    this.issuerModel = customModel ?? getIssuerModel();
  }

  public async save(tenantId: string, issuer: Issuer): Promise<void> {
    await this.issuerModel.findOneAndUpdate(
      { tenantId },
      {
        tenantId,
        rut: issuer.rut.toCanonical(),
        razonSocial: issuer.razonSocial,
        giro: issuer.giro,
        actividadEconomica: issuer.actividadEconomica,
        direccion: issuer.direccion,
        comuna: issuer.comuna,
        ciudad: issuer.ciudad,
        correo: issuer.correo,
        telefono: issuer.telefono,
        ...(issuer.fchResol !== undefined ? { fchResol: issuer.fchResol } : {}),
        ...(issuer.nroResol !== undefined ? { nroResol: issuer.nroResol } : {})
      },
      { upsert: true, returnDocument: 'after' }
    );
  }

  public async findByTenantId(tenantId: string): Promise<Issuer | null> {
    const doc = await this.issuerModel
      .findOne({ tenantId })
      .lean<IssuerDocument | null>()
      .exec();

    if (!doc) {
      return null;
    }

    return Issuer.create({
      rut: Rut.of(doc.rut),
      razonSocial: doc.razonSocial,
      giro: doc.giro,
      actividadEconomica: doc.actividadEconomica,
      direccion: doc.direccion,
      comuna: doc.comuna,
      ciudad: doc.ciudad,
      correo: doc.correo,
      telefono: doc.telefono,
      fchResol: doc.fchResol,
      nroResol: doc.nroResol
    });
  }
}
