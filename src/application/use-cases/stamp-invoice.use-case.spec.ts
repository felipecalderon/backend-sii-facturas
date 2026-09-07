import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { StampInvoiceUseCase } from './stamp-invoice.use-case.js';
import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { Caf, type CafProps } from '../../domain/folio/entities/caf.entity.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

describe('StampInvoiceUseCase', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });

  const createMockCaf = (overrides: Partial<CafProps> = {}): Caf =>
    Caf.create({
      tenantId: 'tenant-123',
      tipoDte: TipoDte.facturaElectronica(),
      rangoDesde: 1,
      rangoHasta: 100,
      ultimoFolioAsignado: 10,
      clavePrivadaPem: privateKey,
      cafXml: '<CAF version="1.0"><DA></DA></CAF>',
      fechaAutorizacion: new Date(),
      rutEmisor: Rut.of('76123456-0'),
      activo: true,
      ...overrides
    });

  const createTestInvoice = (
    tenantId = 'tenant-123',
    folio?: number
  ): Invoice => {
    const inv = Invoice.createDraft({
      tenantId,
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor Test SpA',
        giro: 'Giro Test',
        actividadEconomica: 620100,
        direccion: 'Calle Test 1',
        comuna: 'Santiago'
      }),
      receptor: Receiver.create({
        rut: Rut.of('6-K'),
        razonSocial: 'Receptor Test',
        giro: 'Comercio',
        direccion: 'Calle Test 2',
        comuna: 'Santiago'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Item Test',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(1000)
        })
      ]
    });
    if (folio !== undefined) {
      inv.assignFolio(folio);
    }
    return inv;
  };

  it('debe timbrar con el CAF entregado explícitamente y transicionar a STAMPED', async () => {
    const caf = createMockCaf();
    const invoice = createTestInvoice('tenant-123', 10);
    const useCase = new StampInvoiceUseCase();

    const result = await useCase.execute({
      tenantId: 'tenant-123',
      invoice,
      caf
    });

    expect(result.invoice.estado).toBe(InvoiceStatus.STAMPED);
    expect(result.invoice.tedXml).toContain('<TED version="1.0">');
    expect(result.ted.signature).toBeDefined();
  });

  it('debe permitir timbrar con un CAF inactivo si el folio está dentro de su rango', async () => {
    const caf = createMockCaf({
      rangoHasta: 10,
      ultimoFolioAsignado: 10,
      activo: false
    });
    const invoice = createTestInvoice('tenant-123', 10);
    const useCase = new StampInvoiceUseCase();

    const result = await useCase.execute({
      tenantId: 'tenant-123',
      invoice,
      caf
    });

    expect(result.invoice.estado).toBe(InvoiceStatus.STAMPED);
  });

  it('debe rechazar el timbraje si la factura no tiene folio asignado', async () => {
    const caf = createMockCaf();
    const useCase = new StampInvoiceUseCase();
    const invoiceWithoutFolio = createTestInvoice('tenant-123');

    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        invoice: invoiceWithoutFolio,
        caf
      })
    ).rejects.toThrow(FiscalValidationError);
  });

  it('debe rechazar si el tenant de la factura no coincide', async () => {
    const caf = createMockCaf();
    const useCase = new StampInvoiceUseCase();
    const invoice = createTestInvoice('otro-tenant', 10);

    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        invoice,
        caf
      })
    ).rejects.toThrow(TenantMismatchError);
  });

  it('debe rechazar si el CAF pertenece a otro tenant', async () => {
    const caf = createMockCaf({ tenantId: 'otro-tenant' });
    const useCase = new StampInvoiceUseCase();
    const invoice = createTestInvoice('tenant-123', 10);

    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        invoice,
        caf
      })
    ).rejects.toThrow(TenantMismatchError);
  });

  it('debe rechazar si el tipo DTE del CAF no corresponde a la factura', async () => {
    const caf = createMockCaf({
      tipoDte: TipoDte.of(34),
      rangoHasta: 100,
      ultimoFolioAsignado: 10
    });
    const useCase = new StampInvoiceUseCase();
    const invoice = createTestInvoice('tenant-123', 10);

    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        invoice,
        caf
      })
    ).rejects.toThrow(FiscalValidationError);
  });

  it('debe rechazar si el RUT del emisor de la factura no coincide con el CAF', async () => {
    const caf = createMockCaf({ rutEmisor: Rut.of('97975000-5') });
    const useCase = new StampInvoiceUseCase();
    const invoice = createTestInvoice('tenant-123', 10);

    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        invoice,
        caf
      })
    ).rejects.toThrow(FiscalValidationError);
  });

  it('debe rechazar si el folio está fuera del rango autorizado del CAF', async () => {
    const caf = createMockCaf({ rangoHasta: 10, ultimoFolioAsignado: 10 });
    const useCase = new StampInvoiceUseCase();
    const invoice = createTestInvoice('tenant-123', 11);

    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        invoice,
        caf
      })
    ).rejects.toThrow(FiscalValidationError);
  });
});
