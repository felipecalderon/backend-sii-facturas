import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { StampInvoiceUseCase } from './stamp-invoice.use-case.js';
import { FolioRepository } from '../../domain/folio/ports/folio.repository.js';
import { Invoice, InvoiceStatus } from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import {
  NoActiveCafError,
  TenantMismatchError,
} from '../../domain/folio/errors/folio-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

describe('StampInvoiceUseCase', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const createMockCaf = (): Caf =>
    Caf.create({
      tenantId: 'tenant-123',
      tipoDte: TipoDte.facturaElectronica(),
      rangoDesde: 1,
      rangoHasta: 100,
      clavePrivadaPem: privateKey,
      cafXml: '<CAF version="1.0"><DA></DA></CAF>',
      fechaAutorizacion: new Date(),
      rutEmisor: Rut.of('76123456-0'),
      activo: true,
    });

  const createTestInvoice = (assignFolio = true): Invoice => {
    const inv = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor Test SpA',
        giro: 'Giro Test',
        actividadEconomica: 620100,
        direccion: 'Calle Test 1',
        comuna: 'Santiago',
      }),
      receptor: Receiver.create({
        rut: Rut.of('6-K'),
        razonSocial: 'Receptor Test',
        giro: 'Comercio',
        direccion: 'Calle Test 2',
        comuna: 'Santiago',
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Item Test',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(1000),
        }),
      ],
    });
    if (assignFolio) {
      inv.assignFolio(10);
    }
    return inv;
  };

  it('debe timbrar la factura y transicionar su estado a STAMPED', async () => {
    const mockCaf = createMockCaf();
    const mockRepository: FolioRepository = {
      saveCaf: vi.fn(),
      findActiveCaf: vi.fn().mockResolvedValue(mockCaf),
      allocateNextFolio: vi.fn(),
      getFolioStatus: vi.fn(),
    };

    const useCase = new StampInvoiceUseCase(mockRepository);
    const invoice = createTestInvoice(true);

    const result = await useCase.execute({
      tenantId: 'tenant-123',
      invoice,
    });

    expect(result.invoice.estado).toBe(InvoiceStatus.STAMPED);
    expect(result.invoice.tedXml).toBeDefined();
    expect(result.invoice.tedXml).toContain('<TED version="1.0">');
    expect(result.ted.signature).toBeDefined();
  });

  it('debe rechazar el timbraje si la factura no tiene folio asignado', async () => {
    const mockRepository: FolioRepository = {
      saveCaf: vi.fn(),
      findActiveCaf: vi.fn(),
      allocateNextFolio: vi.fn(),
      getFolioStatus: vi.fn(),
    };

    const useCase = new StampInvoiceUseCase(mockRepository);
    const invoiceWithoutFolio = createTestInvoice(false);

    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        invoice: invoiceWithoutFolio,
      }),
    ).rejects.toThrow(FiscalValidationError);
  });

  it('debe fallar con NoActiveCafError si no hay un CAF disponible para el tenant', async () => {
    const mockRepository: FolioRepository = {
      saveCaf: vi.fn(),
      findActiveCaf: vi.fn().mockResolvedValue(null),
      allocateNextFolio: vi.fn(),
      getFolioStatus: vi.fn(),
    };

    const useCase = new StampInvoiceUseCase(mockRepository);
    const invoice = createTestInvoice(true);

    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        invoice,
      }),
    ).rejects.toThrow(NoActiveCafError);
  });

  it('debe rechazar si el tenant no coincide con el de la factura', async () => {
    const mockRepository: FolioRepository = {
      saveCaf: vi.fn(),
      findActiveCaf: vi.fn(),
      allocateNextFolio: vi.fn(),
      getFolioStatus: vi.fn(),
    };

    const useCase = new StampInvoiceUseCase(mockRepository);
    const invoice = createTestInvoice(true);

    await expect(
      useCase.execute({
        tenantId: 'otro-tenant',
        invoice,
      }),
    ).rejects.toThrow(TenantMismatchError);
  });
});
