import { describe, it, expect, vi } from 'vitest';
import { AllocateFolioUseCase } from './allocate-folio.use-case.js';
import { FolioRepository } from '../../domain/folio/ports/folio.repository.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Money } from '../../domain/shared/money.vo.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';

describe('AllocateFolioUseCase', () => {
  const createMockCaf = (): Caf =>
    Caf.create({
      tenantId: 'tenant-123',
      tipoDte: TipoDte.facturaElectronica(),
      rangoDesde: 1,
      rangoHasta: 100,
      ultimoFolioAsignado: 50,
      clavePrivadaPem:
        '-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----',
      cafXml: '<CAF><DA></DA></CAF>',
      fechaAutorizacion: new Date(),
      rutEmisor: Rut.of('76123456-0'),
      activo: true
    });

  const createTestInvoice = (tenantId = 'tenant-123'): Invoice =>
    Invoice.createDraft({
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

  it('debe asignar el siguiente folio y asociarlo a la factura en borrador', async () => {
    const mockCaf = createMockCaf();
    const mockRepository: FolioRepository = {
      saveCaf: vi.fn(),
      findActiveCaf: vi.fn(),
      allocateNextFolio: vi.fn().mockResolvedValue({ folio: 51, caf: mockCaf }),
      getFolioStatus: vi.fn()
    };

    const useCase = new AllocateFolioUseCase(mockRepository);
    const invoice = createTestInvoice('tenant-123');

    const result = await useCase.execute({
      tenantId: 'tenant-123',
      tipoDte: 33,
      invoice
    });

    expect(result.folio).toBe(51);
    expect(result.invoice?.folio).toBe(51);
    expect(result.invoice?.estado).toBe(InvoiceStatus.FOLIO_ASSIGNED);
    expect(mockRepository.allocateNextFolio).toHaveBeenCalledWith(
      'tenant-123',
      expect.objectContaining({ code: 33 })
    );
  });

  it('debe rechazar la asignación si el tenant de la factura no coincide con la solicitud', async () => {
    const mockRepository: FolioRepository = {
      saveCaf: vi.fn(),
      findActiveCaf: vi.fn(),
      allocateNextFolio: vi.fn(),
      getFolioStatus: vi.fn()
    };

    const useCase = new AllocateFolioUseCase(mockRepository);
    const invoice = createTestInvoice('tenant-otro');

    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        tipoDte: 33,
        invoice
      })
    ).rejects.toThrow(TenantMismatchError);
  });
});
