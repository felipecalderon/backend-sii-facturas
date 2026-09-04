import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MongoInvoiceRepository } from './mongo-invoice.repository.js';
import {
  Invoice,
  InvoiceStatus
} from '../../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../../domain/dte/entities/invoice-item.entity.js';
import { TipoDte } from '../../../domain/dte/values/dte-type.vo.js';
import { Rut } from '../../../domain/shared/rut.vo.js';
import { Money } from '../../../domain/shared/money.vo.js';

describe('MongoInvoiceRepository', () => {
  let mockModel: any;
  let repository: MongoInvoiceRepository;

  const validIssuer = Issuer.create({
    rut: Rut.of('76123456-0'),
    razonSocial: 'Emisor SpA',
    giro: 'Servicios',
    actividadEconomica: 620100,
    direccion: 'Calle 1',
    comuna: 'Santiago'
  });

  const validReceiver = Receiver.create({
    rut: Rut.of('55666777-2'),
    razonSocial: 'Receptor SA',
    giro: 'Comercio',
    direccion: 'Calle 2',
    comuna: 'Santiago'
  });

  const createInvoice = () => {
    const inv = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-04'),
      emisor: validIssuer,
      receptor: validReceiver,
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Producto 1',
          cantidad: Money.fromInteger(2),
          precioUnitario: Money.fromInteger(5000)
        })
      ],
      idempotencyKey: 'key-abc-123'
    });
    inv.assignFolio(42);
    inv.stampTed('<TED>test</TED>');
    inv.setDteXml('<DTE>test</DTE>');
    inv.sign('<DTE><Signature>test</Signature></DTE>');
    inv.markPersisted();
    return inv;
  };

  beforeEach(() => {
    mockModel = {
      findOneAndUpdate: vi.fn().mockResolvedValue({}),
      findOne: vi.fn(),
      create: vi.fn().mockResolvedValue({})
    };
    repository = new MongoInvoiceRepository(mockModel);
  });

  it('save() actualiza mediante findOneAndUpdate cuando existe idempotencyKey', async () => {
    const invoice = createInvoice();
    await repository.save(invoice);

    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-123', idempotencyKey: 'key-abc-123' },
      { $set: expect.objectContaining({ tenantId: 'tenant-123', folio: 42 }) },
      { upsert: true, new: true }
    );
  });

  it('save() actualiza mediante findOneAndUpdate cuando no hay idempotencyKey pero sí folio', async () => {
    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-04'),
      emisor: validIssuer,
      receptor: validReceiver,
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Producto 1',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(5000)
        })
      ]
    });
    invoice.assignFolio(99);

    await repository.save(invoice);

    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-123', tipoDte: 33, folio: 99 },
      { $set: expect.objectContaining({ tenantId: 'tenant-123', folio: 99 }) },
      { upsert: true, new: true }
    );
  });

  it('findByFolio() mapea correctamente un documento de MongoDB a la entidad de dominio', async () => {
    const mockDoc = {
      tenantId: 'tenant-123',
      tipoDte: 33,
      folio: 42,
      fechaEmision: new Date('2026-09-04'),
      emisor: {
        rut: '76123456-0',
        razonSocial: 'Emisor SpA',
        giro: 'Servicios',
        actividadEconomica: 620100,
        direccion: 'Calle 1',
        comuna: 'Santiago'
      },
      receptor: {
        rut: '55666777-2',
        razonSocial: 'Receptor SA',
        giro: 'Comercio',
        direccion: 'Calle 2',
        comuna: 'Santiago'
      },
      items: [
        {
          linea: 1,
          nombre: 'Producto 1',
          cantidad: '2.000000',
          precioUnitario: '5000.000000',
          esExento: false,
          currency: 'CLP'
        }
      ],
      totales: {
        montoNeto: '10000.000000',
        montoExento: '0.000000',
        tasaIva: 19,
        montoIva: '1900.000000',
        montoTotal: '11900.000000',
        currency: 'CLP'
      },
      estado: InvoiceStatus.SUBMITTED,
      idempotencyKey: 'key-abc-123',
      tedXml: '<TED>test</TED>',
      dteXml: '<DTE>test</DTE>',
      signedDteXml: '<DTE><Signature>test</Signature></DTE>',
      trackId: '123456789'
    };

    mockModel.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockDoc)
    });

    const result = await repository.findByFolio(
      'tenant-123',
      TipoDte.facturaElectronica(),
      42
    );

    expect(result).not.toBeNull();
    expect(result!.tenantId).toBe('tenant-123');
    expect(result!.folio).toBe(42);
    expect(result!.estado).toBe(InvoiceStatus.SUBMITTED);
    expect(result!.trackId).toBe('123456789');
    expect(result!.totales.getNetoClp()).toBe(10000);
    expect(result!.totales.getIvaClp()).toBe(1900);
    expect(result!.totales.getTotalClp()).toBe(11900);
  });

  it('findByFolio() retorna null si el documento no existe', async () => {
    mockModel.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(null)
    });

    const result = await repository.findByFolio(
      'tenant-123',
      TipoDte.facturaElectronica(),
      999
    );

    expect(result).toBeNull();
  });
});
