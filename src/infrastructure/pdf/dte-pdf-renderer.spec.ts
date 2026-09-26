import { describe, it, expect } from 'vitest';
import { DtePdfRenderer } from './dte-pdf-renderer.js';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

describe('DtePdfRenderer', () => {
  const sampleTedXml = `
    <TED version="1.0">
      <DD>
        <RE>76123456-0</RE>
        <TD>33</TD>
        <F>105</F>
        <FE>2026-09-26</FE>
        <RR>55555555-5</RR>
        <RSR>Cliente de Prueba SpA</RSR>
        <MNT>119000</MNT>
        <IT1>Servicio de Desarrollo de Software</IT1>
        <CAF version="1.0">
          <DA><RE>76123456-0</RE><RS>Emisor</RS><TD>33</TD><RNG><D>1</D><H>500</H></RNG><FA>2026-09-01</FA><RSAPK><M>AQAB</M><E>AQAB</E></RSAPK><IDK>3</IDK></DA>
          <FRMA>firmaBase64</FRMA>
        </CAF>
        <TSTED>2026-09-26T12:00:00</TSTED>
      </DD>
      <FRMT algoritmo="SHA1withRSA">firmaTedBase64...</FRMT>
    </TED>
  `.trim();

  const createValidInvoice = (): Invoice => {
    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-26'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Tecnologías y Sistemas SpA',
        giro: 'Consultoría y Desarrollo de Software',
        actividadEconomica: 620100,
        direccion: 'Av. Providencia 1234, Of. 601',
        comuna: 'Providencia',
        ciudad: 'Santiago',
        correo: 'facturacion@tecnologias.cl',
        telefono: '+56 2 2345 6789',
        fchResol: '2026-01-15',
        nroResol: 80
      }),
      receptor: Receiver.create({
        rut: Rut.of('77888999-1'),
        razonSocial: 'Comercializadora del Sur S.A.',
        giro: 'Venta al por mayor',
        direccion: 'Av. Las Condes 5678',
        comuna: 'Las Condes',
        ciudad: 'Santiago',
        contacto: 'Juan Pérez'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Licencia Software Cloud Anual',
          descripcion: 'Suscripción Enterprise 12 meses',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(100000),
          esExento: false
        })
      ],
      tasaIva: 19
    });

    invoice.assignFolio(105);
    invoice.stampTed(sampleTedXml);

    return invoice;
  };

  it('debe generar un buffer PDF válido con encabezado %PDF', async () => {
    const invoice = createValidInvoice();

    const pdfBuffer = await DtePdfRenderer.renderToBuffer({ invoice });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Los primeros 4 bytes de un archivo PDF válido siempre son %PDF (0x25, 0x50, 0x44, 0x46)
    const header = pdfBuffer.subarray(0, 4).toString('ascii');
    expect(header).toBe('%PDF');
  });

  it('debe fallar si la factura no tiene folio asignado', async () => {
    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-26'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor SpA',
        giro: 'Servicios',
        actividadEconomica: 620100,
        direccion: 'Calle 1',
        comuna: 'Santiago'
      }),
      receptor: Receiver.create({
        rut: Rut.of('77888999-1'),
        razonSocial: 'Receptor SpA',
        giro: 'Comercio',
        direccion: 'Calle 2',
        comuna: 'Santiago'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Item',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(10000)
        })
      ]
    });

    await expect(DtePdfRenderer.renderToBuffer({ invoice })).rejects.toThrow(
      FiscalValidationError
    );
  });

  it('debe fallar si la factura no tiene timbre TED', async () => {
    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-26'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor SpA',
        giro: 'Servicios',
        actividadEconomica: 620100,
        direccion: 'Calle 1',
        comuna: 'Santiago'
      }),
      receptor: Receiver.create({
        rut: Rut.of('77888999-1'),
        razonSocial: 'Receptor SpA',
        giro: 'Comercio',
        direccion: 'Calle 2',
        comuna: 'Santiago'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Item',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(10000)
        })
      ]
    });
    invoice.assignFolio(105);

    await expect(DtePdfRenderer.renderToBuffer({ invoice })).rejects.toThrow(
      FiscalValidationError
    );
  });
});
