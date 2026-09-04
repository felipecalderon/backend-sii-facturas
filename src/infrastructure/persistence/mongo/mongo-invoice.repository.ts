import type { Model } from 'mongoose';
import { InvoiceRepository } from '../../../domain/dte/ports/invoice.repository.js';
import {
  Invoice,
  InvoiceStatus
} from '../../../domain/dte/entities/invoice.entity.js';
import { TipoDte } from '../../../domain/dte/values/dte-type.vo.js';
import { Rut } from '../../../domain/shared/rut.vo.js';
import { Money } from '../../../domain/shared/money.vo.js';
import { Issuer } from '../../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../../domain/dte/entities/invoice-item.entity.js';
import { InvoiceTotals } from '../../../domain/dte/values/invoice-totals.vo.js';
import { InvoiceDocument, getInvoiceModel } from './schemas/invoice.schema.js';

export class MongoInvoiceRepository implements InvoiceRepository {
  private readonly invoiceModel: Model<InvoiceDocument>;

  constructor(customModel?: Model<InvoiceDocument>) {
    this.invoiceModel = customModel ?? getInvoiceModel();
  }

  public async save(invoice: Invoice): Promise<void> {
    const data = this.toDocumentData(invoice);

    if (invoice.idempotencyKey) {
      await this.invoiceModel.findOneAndUpdate(
        { tenantId: invoice.tenantId, idempotencyKey: invoice.idempotencyKey },
        { $set: data },
        { upsert: true, new: true }
      );
      return;
    }

    if (invoice.folio !== undefined) {
      await this.invoiceModel.findOneAndUpdate(
        {
          tenantId: invoice.tenantId,
          tipoDte: invoice.tipoDte.code,
          folio: invoice.folio
        },
        { $set: data },
        { upsert: true, new: true }
      );
      return;
    }

    await this.invoiceModel.create(data);
  }

  public async findByFolio(
    tenantId: string,
    tipoDte: TipoDte,
    folio: number
  ): Promise<Invoice | null> {
    const doc = await this.invoiceModel
      .findOne({
        tenantId,
        tipoDte: tipoDte.code,
        folio
      })
      .exec();

    return doc ? this.toDomain(doc) : null;
  }

  public async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<Invoice | null> {
    const doc = await this.invoiceModel
      .findOne({
        tenantId,
        idempotencyKey
      })
      .exec();

    return doc ? this.toDomain(doc) : null;
  }

  private toDocumentData(invoice: Invoice): Record<string, unknown> {
    return {
      tenantId: invoice.tenantId,
      tipoDte: invoice.tipoDte.code,
      folio: invoice.folio,
      fechaEmision: invoice.fechaEmision,
      emisor: {
        rut: invoice.emisor.rut.toCanonical(),
        razonSocial: invoice.emisor.razonSocial,
        giro: invoice.emisor.giro,
        actividadEconomica: invoice.emisor.actividadEconomica,
        direccion: invoice.emisor.direccion,
        comuna: invoice.emisor.comuna,
        ciudad: invoice.emisor.ciudad,
        correo: invoice.emisor.correo,
        telefono: invoice.emisor.telefono
      },
      receptor: {
        rut: invoice.receptor.rut.toCanonical(),
        razonSocial: invoice.receptor.razonSocial,
        giro: invoice.receptor.giro,
        direccion: invoice.receptor.direccion,
        comuna: invoice.receptor.comuna,
        ciudad: invoice.receptor.ciudad,
        correo: invoice.receptor.correo,
        contacto: invoice.receptor.contacto
      },
      items: invoice.items.map((item) => ({
        linea: item.linea,
        nombre: item.nombre,
        descripcion: item.descripcion,
        cantidad: item.cantidad.toDecimalString(6),
        precioUnitario: item.precioUnitario.toDecimalString(6),
        esExento: item.esExento,
        descuentoPct: item.descuentoPct,
        descuentoMonto: item.descuentoMonto.isZero()
          ? undefined
          : item.descuentoMonto.toDecimalString(6),
        currency: item.precioUnitario.currency
      })),
      totales: {
        montoNeto: invoice.totales.montoNeto.toDecimalString(6),
        montoExento: invoice.totales.montoExento.toDecimalString(6),
        tasaIva: invoice.totales.tasaIva,
        montoIva: invoice.totales.montoIva.toDecimalString(6),
        montoTotal: invoice.totales.montoTotal.toDecimalString(6),
        currency: invoice.totales.montoTotal.currency
      },
      estado: invoice.estado,
      idempotencyKey: invoice.idempotencyKey,
      tedXml: invoice.tedXml,
      dteXml: invoice.dteXml,
      signedDteXml: invoice.signedDteXml,
      trackId: invoice.trackId,
      glosaRechazo: invoice.glosaRechazo,
      observaciones: invoice.observaciones
        ? [...invoice.observaciones]
        : undefined
    };
  }

  private toDomain(doc: InvoiceDocument): Invoice {
    const emisor = Issuer.create({
      rut: Rut.of(doc.emisor.rut),
      razonSocial: doc.emisor.razonSocial,
      giro: doc.emisor.giro,
      actividadEconomica: doc.emisor.actividadEconomica,
      direccion: doc.emisor.direccion,
      comuna: doc.emisor.comuna,
      ciudad: doc.emisor.ciudad,
      correo: doc.emisor.correo,
      telefono: doc.emisor.telefono
    });

    const receptor = Receiver.create({
      rut: Rut.of(doc.receptor.rut),
      razonSocial: doc.receptor.razonSocial,
      giro: doc.receptor.giro,
      direccion: doc.receptor.direccion,
      comuna: doc.receptor.comuna,
      ciudad: doc.receptor.ciudad,
      correo: doc.receptor.correo,
      contacto: doc.receptor.contacto
    });

    const items = doc.items.map((i) => {
      const currency = i.currency ?? 'CLP';
      return InvoiceItem.create({
        linea: i.linea,
        nombre: i.nombre,
        descripcion: i.descripcion,
        cantidad: Money.fromDecimal(i.cantidad, currency),
        precioUnitario: Money.fromDecimal(i.precioUnitario, currency),
        esExento: i.esExento,
        descuentoPct: i.descuentoPct,
        descuentoMonto: i.descuentoMonto
          ? Money.fromDecimal(i.descuentoMonto, currency)
          : undefined
      });
    });

    const totalsCurrency = doc.totales.currency ?? 'CLP';
    const totales = InvoiceTotals.create({
      montoNeto: Money.fromDecimal(doc.totales.montoNeto, totalsCurrency),
      montoExento: Money.fromDecimal(doc.totales.montoExento, totalsCurrency),
      tasaIva: doc.totales.tasaIva,
      montoIva: Money.fromDecimal(doc.totales.montoIva, totalsCurrency),
      montoTotal: Money.fromDecimal(doc.totales.montoTotal, totalsCurrency)
    });

    return Invoice.reconstitute({
      tenantId: doc.tenantId,
      tipoDte: TipoDte.of(doc.tipoDte),
      folio: doc.folio,
      fechaEmision: doc.fechaEmision,
      emisor,
      receptor,
      items,
      totales,
      estado: doc.estado as InvoiceStatus,
      idempotencyKey: doc.idempotencyKey,
      tedXml: doc.tedXml,
      dteXml: doc.dteXml,
      signedDteXml: doc.signedDteXml,
      trackId: doc.trackId,
      glosaRechazo: doc.glosaRechazo,
      observaciones: doc.observaciones ? [...doc.observaciones] : undefined
    });
  }
}
