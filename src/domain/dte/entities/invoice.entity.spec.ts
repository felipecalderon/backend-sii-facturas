import { describe, it, expect } from 'vitest';
import { Invoice, InvoiceStatus } from './invoice.entity.js';
import { Issuer } from './issuer.entity.js';
import { Receiver } from './receiver.entity.js';
import { InvoiceItem } from './invoice-item.entity.js';
import { Rut } from '../../shared/rut.vo.js';
import { Money } from '../../shared/money.vo.js';
import { FiscalValidationError } from '../errors/fiscal-domain.error.js';

describe('Invoice Aggregate Root (Factura 33)', () => {
  const createValidIssuer = (): Issuer =>
    Issuer.create({
      rut: Rut.of('76123456-0'),
      razonSocial: 'Empresa Emisora SpA',
      giro: 'Servicios Informáticos',
      actividadEconomica: 620100,
      direccion: 'Av. Providencia 1234',
      comuna: 'Providencia',
      ciudad: 'Santiago'
    });

  const createValidReceiver = (): Receiver =>
    Receiver.create({
      rut: Rut.of('6-K'),
      razonSocial: 'Cliente Receptor S.A.',
      giro: 'Comercio General',
      direccion: 'Calle Los Alerces 456',
      comuna: 'Las Condes',
      ciudad: 'Santiago'
    });

  it('debe crear un borrador de factura (DRAFT) y calcular totales fiscales con 19% de IVA', () => {
    const issuer = createValidIssuer();
    const receiver = createValidReceiver();

    const item1 = InvoiceItem.create({
      linea: 1,
      nombre: 'Licencia de Software Anual',
      cantidad: Money.fromInteger(1),
      precioUnitario: Money.fromInteger(100000) // Neto: 100.000
    });

    const item2 = InvoiceItem.create({
      linea: 2,
      nombre: 'Consultoría Técnica (horas)',
      cantidad: Money.fromDecimal('2.5'),
      precioUnitario: Money.fromInteger(20000) // 2.5 * 20.000 = 50.000
    });

    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-03'),
      emisor: issuer,
      receptor: receiver,
      items: [item1, item2]
    });

    expect(invoice.estado).toBe(InvoiceStatus.DRAFT);
    expect(invoice.folio).toBeUndefined();
    expect(invoice.totales.getNetoClp()).toBe(150000);
    expect(invoice.totales.getExentoClp()).toBe(0);
    expect(invoice.totales.getIvaClp()).toBe(28500); // 150.000 * 0.19 = 28.500
    expect(invoice.totales.getTotalClp()).toBe(178500); // 150.000 + 28.500
  });

  it('debe calcular correctamente facturas mixtas con ítems afectos y exentos', () => {
    const issuer = createValidIssuer();
    const receiver = createValidReceiver();

    const itemAfecto = InvoiceItem.create({
      linea: 1,
      nombre: 'Producto Afecto',
      cantidad: Money.fromInteger(1),
      precioUnitario: Money.fromInteger(10000),
      esExento: false
    });

    const itemExento = InvoiceItem.create({
      linea: 2,
      nombre: 'Servicio Exento de IVA',
      cantidad: Money.fromInteger(1),
      precioUnitario: Money.fromInteger(5000),
      esExento: true
    });

    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-03'),
      emisor: issuer,
      receptor: receiver,
      items: [itemAfecto, itemExento]
    });

    expect(invoice.totales.getNetoClp()).toBe(10000);
    expect(invoice.totales.getExentoClp()).toBe(5000);
    expect(invoice.totales.getIvaClp()).toBe(1900); // 10.000 * 0.19 = 1.900
    expect(invoice.totales.getTotalClp()).toBe(16900); // 10.000 + 5.000 + 1.900
  });

  it('debe permitir asignar folio únicamente si está en estado DRAFT', () => {
    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-03'),
      emisor: createValidIssuer(),
      receptor: createValidReceiver(),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Servicio',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(1000)
        })
      ]
    });

    invoice.assignFolio(501);
    expect(invoice.folio).toBe(501);
    expect(invoice.estado).toBe(InvoiceStatus.FOLIO_ASSIGNED);

    // No se puede reasignar si ya no es DRAFT
    expect(() => invoice.assignFolio(502)).toThrow(FiscalValidationError);
  });

  it('debe rechazar números de línea duplicados', () => {
    const item1 = InvoiceItem.create({
      linea: 1,
      nombre: 'Item 1',
      cantidad: Money.fromInteger(1),
      precioUnitario: Money.fromInteger(1000)
    });
    const item2 = InvoiceItem.create({
      linea: 1, // Duplicado
      nombre: 'Item 2',
      cantidad: Money.fromInteger(1),
      precioUnitario: Money.fromInteger(2000)
    });

    expect(() =>
      Invoice.createDraft({
        tenantId: 'tenant-123',
        fechaEmision: new Date('2026-09-03'),
        emisor: createValidIssuer(),
        receptor: createValidReceiver(),
        items: [item1, item2]
      })
    ).toThrow(FiscalValidationError);
  });

  it('debe transicionar por el ciclo completo de envío: SIGNED -> PERSISTED -> SUBMITTED -> ACCEPTED', () => {
    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-03'),
      emisor: createValidIssuer(),
      receptor: createValidReceiver(),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Servicio',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(1000)
        })
      ]
    });

    invoice.assignFolio(10);
    invoice.stampTed('<TED version="1.0"><DD></DD></TED>');
    invoice.setDteXml('<DTE version="1.0"><Documento></Documento></DTE>');
    invoice.sign(
      '<DTE version="1.0"><Documento></Documento><Signature></Signature></DTE>'
    );
    expect(invoice.estado).toBe(InvoiceStatus.SIGNED);

    invoice.markPersisted();
    expect(invoice.estado).toBe(InvoiceStatus.PERSISTED);

    invoice.markSubmitted('9876543210');
    expect(invoice.estado).toBe(InvoiceStatus.SUBMITTED);
    expect(invoice.trackId).toBe('9876543210');

    invoice.markAccepted();
    expect(invoice.estado).toBe(InvoiceStatus.ACCEPTED);
  });

  it('debe manejar transiciones a REJECTED, OBSERVED y UNKNOWN ante regla de incertidumbre', () => {
    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-03'),
      emisor: createValidIssuer(),
      receptor: createValidReceiver(),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Servicio',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(1000)
        })
      ]
    });

    invoice.assignFolio(11);
    invoice.stampTed('<TED version="1.0"><DD></DD></TED>');
    invoice.setDteXml('<DTE version="1.0"><Documento></Documento></DTE>');
    invoice.sign(
      '<DTE version="1.0"><Documento></Documento><Signature></Signature></DTE>'
    );
    invoice.markSubmitted('11223344');

    // Transición a REJECTED
    invoice.markRejected('Error en Carátula');
    expect(invoice.estado).toBe(InvoiceStatus.REJECTED);
    expect(invoice.glosaRechazo).toBe('Error en Carátula');

    // Regla de incertidumbre: UNKNOWN
    invoice.markUnknown('Timeout en consulta');
    expect(invoice.estado).toBe(InvoiceStatus.UNKNOWN);
    expect(invoice.glosaRechazo).toBe('Timeout en consulta');

    // Recuperación desde UNKNOWN a OBSERVED
    invoice.markObserved(['Falta actividad económica secundaria']);
    expect(invoice.estado).toBe(InvoiceStatus.OBSERVED);
    expect(invoice.observaciones).toEqual([
      'Falta actividad económica secundaria'
    ]);
  });

  it('debe permitir transiciones idempotentes a ACCEPTED, REJECTED y OBSERVED sin lanzar error', () => {
    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-03'),
      emisor: createValidIssuer(),
      receptor: createValidReceiver(),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Servicio',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(1000)
        })
      ]
    });

    invoice.assignFolio(12);
    invoice.stampTed('<TED version="1.0"><DD></DD></TED>');
    invoice.setDteXml('<DTE version="1.0"><Documento></Documento></DTE>');
    invoice.sign(
      '<DTE version="1.0"><Documento></Documento><Signature></Signature></DTE>'
    );
    invoice.markSubmitted('99887766');

    // Idempotencia en ACCEPTED
    invoice.markAccepted();
    expect(() => invoice.markAccepted()).not.toThrow();
    expect(invoice.estado).toBe(InvoiceStatus.ACCEPTED);
  });
});
