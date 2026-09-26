import { describe, it, expect, vi } from 'vitest';
import { GenerateDtePdfUseCase } from './generate-dte-pdf.use-case.js';
import { InvoiceRepository } from '../../domain/dte/ports/invoice.repository.js';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import { DtePdfRenderer } from '../../infrastructure/pdf/dte-pdf-renderer.js';

describe('GenerateDtePdfUseCase', () => {
  const sampleTedXml = `
    <TED version="1.0">
      <DD>
        <RE>76123456-0</RE><TD>33</TD><F>105</F><FE>2026-09-26</FE><RR>55555555-5</RR>
        <RSR>Cliente SpA</RSR><MNT>119000</MNT><IT1>Consultoria</IT1>
        <CAF version="1.0"><DA><RE>76123456-0</RE><RS>Emisor</RS><TD>33</TD><RNG><D>1</D><H>500</H></RNG><FA>2026-09-01</FA><RSAPK><M>AQAB</M><E>AQAB</E></RSAPK><IDK>3</IDK></DA><FRMA>firma</FRMA></CAF>
        <TSTED>2026-09-26T12:00:00</TSTED>
      </DD>
      <FRMT algoritmo="SHA1withRSA">firmaBase64</FRMT>
    </TED>
  `.trim();

  const createInvoiceMock = (): Invoice => {
    const inv = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-26'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor SpA',
        giro: 'Servicios TI',
        actividadEconomica: 620100,
        direccion: 'Av Test 123',
        comuna: 'Santiago'
      }),
      receptor: Receiver.create({
        rut: Rut.of('55555555-5'),
        razonSocial: 'Cliente SpA',
        giro: 'Comercio',
        direccion: 'Calle Test 456',
        comuna: 'Providencia'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Consultoria TI',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(100000)
        })
      ]
    });
    inv.assignFolio(105);
    inv.stampTed(sampleTedXml);
    return inv;
  };

  it('debe orquestar la obtención de la factura y retornar el buffer PDF con su nombre de archivo', async () => {
    const invoice = createInvoiceMock();
    const fakeBuffer = Buffer.from('%PDF-1.4 mock content');
    vi.spyOn(DtePdfRenderer, 'renderToBuffer').mockResolvedValue(fakeBuffer);

    const mockRepo: InvoiceRepository = {
      save: vi.fn(),
      findByFolio: vi.fn().mockResolvedValue(invoice),
      findByIdempotencyKey: vi.fn(),
      findMany: vi.fn()
    };

    const useCase = new GenerateDtePdfUseCase(mockRepo);
    const result = await useCase.execute({
      tenantId: 'tenant-123',
      folio: 105,
      tipoDte: 33
    });

    expect(result.pdfBuffer).toEqual(fakeBuffer);
    expect(result.filename).toBe('dte-33-105.pdf');
    expect(mockRepo.findByFolio).toHaveBeenCalledWith(
      'tenant-123',
      expect.anything(),
      105
    );
  });

  it('debe lanzar FiscalValidationError si la factura no existe en persistencia', async () => {
    const mockRepo: InvoiceRepository = {
      save: vi.fn(),
      findByFolio: vi.fn().mockResolvedValue(null),
      findByIdempotencyKey: vi.fn(),
      findMany: vi.fn()
    };

    const useCase = new GenerateDtePdfUseCase(mockRepo);
    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        folio: 999
      })
    ).rejects.toThrow(FiscalValidationError);
  });

  it('debe lanzar FiscalValidationError si la factura no tiene timbre TED', async () => {
    const invoiceWithoutTed = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-26'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor SpA',
        giro: 'Servicios TI',
        actividadEconomica: 620100,
        direccion: 'Av Test 123',
        comuna: 'Santiago'
      }),
      receptor: Receiver.create({
        rut: Rut.of('55555555-5'),
        razonSocial: 'Cliente SpA',
        giro: 'Comercio',
        direccion: 'Calle Test 456',
        comuna: 'Providencia'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Consultoria TI',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(100000)
        })
      ]
    });
    invoiceWithoutTed.assignFolio(105);

    const mockRepo: InvoiceRepository = {
      save: vi.fn(),
      findByFolio: vi.fn().mockResolvedValue(invoiceWithoutTed),
      findByIdempotencyKey: vi.fn(),
      findMany: vi.fn()
    };

    const useCase = new GenerateDtePdfUseCase(mockRepo);
    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        folio: 105
      })
    ).rejects.toThrow(FiscalValidationError);
  });
});
