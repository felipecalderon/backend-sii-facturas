import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubmitEnvioDteUseCase } from './submit-envio-dte.use-case.js';
import { AuthenticateSiiUseCase } from './authenticate-sii.use-case.js';
import { SiiGateway } from '../../domain/sii/ports/sii-gateway.port.js';
import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import { SiiConnectionError } from '../../domain/sii/errors/sii-domain.error.js';

describe('SubmitEnvioDteUseCase', () => {
  let mockAuthUseCase: AuthenticateSiiUseCase;
  let mockSiiGateway: SiiGateway;

  const getSignedInvoice = (
    tenantId = 'tenant-submit',
    folio = 55
  ): Invoice => {
    const inv = Invoice.createDraft({
      tenantId,
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor SpA',
        giro: 'Servicios',
        actividadEconomica: 620100,
        direccion: 'Av 1',
        comuna: 'Santiago'
      }),
      receptor: Receiver.create({
        rut: Rut.of('6-K'),
        razonSocial: 'Receptor SA',
        giro: 'Comercio',
        direccion: 'Calle 2',
        comuna: 'Santiago'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Licencia',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(10000)
        })
      ]
    });

    inv.assignFolio(folio);
    inv.stampTed('<TED version="1.0"><DD></DD></TED>');
    inv.setDteXml(
      '<DTE version="1.0"><Documento ID="F55T33"></Documento></DTE>'
    );
    inv.sign(
      '<DTE version="1.0"><Documento ID="F55T33"></Documento><Signature></Signature></DTE>'
    );
    return inv;
  };

  beforeEach(() => {
    mockAuthUseCase = {
      execute: vi.fn().mockResolvedValue({
        token: 'MOCK_TOKEN_1234',
        environment: 'CERTIFICATION'
      })
    } as any;

    mockSiiGateway = {
      getSeed: vi.fn(),
      getToken: vi.fn(),
      sendDte: vi.fn().mockResolvedValue({
        trackId: '1029384756',
        status: '0'
      }),
      querySendStatus: vi.fn()
    };
  });

  it('debe autenticar, enviar EnvioDTE y transicionar las facturas a SUBMITTED con su trackId', async () => {
    const useCase = new SubmitEnvioDteUseCase(mockAuthUseCase, mockSiiGateway);
    const invoice = getSignedInvoice('tenant-submit', 55);

    const result = await useCase.execute({
      tenantId: 'tenant-submit',
      invoices: [invoice],
      envioDteXml: '<EnvioDTE><SetDTE></SetDTE></EnvioDTE>',
      rutSender: Rut.of('15123456-9'),
      environment: 'CERTIFICATION'
    });

    expect(result.trackId).toBe('1029384756');
    expect(result.environment).toBe('CERTIFICATION');
    expect(invoice.estado).toBe(InvoiceStatus.SUBMITTED);
    expect(invoice.trackId).toBe('1029384756');

    expect(mockAuthUseCase.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-submit',
      environment: 'CERTIFICATION'
    });
    expect(mockSiiGateway.sendDte).toHaveBeenCalledTimes(1);
  });

  it('debe rechazar facturas con tenantId incongruente', async () => {
    const useCase = new SubmitEnvioDteUseCase(mockAuthUseCase, mockSiiGateway);
    const invoice = getSignedInvoice('tenant-submit', 55);

    await expect(
      useCase.execute({
        tenantId: 'otro-tenant',
        invoices: [invoice],
        envioDteXml: '<EnvioDTE></EnvioDTE>',
        rutSender: Rut.of('15123456-9')
      })
    ).rejects.toThrow(TenantMismatchError);
  });

  it('debe rechazar facturas que no estén en estado SIGNED o PERSISTED', async () => {
    const useCase = new SubmitEnvioDteUseCase(mockAuthUseCase, mockSiiGateway);
    const draftInvoice = Invoice.createDraft({
      tenantId: 'tenant-submit',
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor',
        giro: 'Giro',
        actividadEconomica: 620100,
        direccion: 'Dir',
        comuna: 'Comuna'
      }),
      receptor: Receiver.create({
        rut: Rut.of('6-K'),
        razonSocial: 'Recep',
        giro: 'Giro',
        direccion: 'Dir',
        comuna: 'Comuna'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Item',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(1000)
        })
      ]
    });

    await expect(
      useCase.execute({
        tenantId: 'tenant-submit',
        invoices: [draftInvoice],
        envioDteXml: '<EnvioDTE></EnvioDTE>',
        rutSender: Rut.of('15123456-9')
      })
    ).rejects.toThrow(FiscalValidationError);
  });

  it('debe aplicar la regla de incertidumbre transicionando a UNKNOWN ante SiiConnectionError', async () => {
    vi.mocked(mockSiiGateway.sendDte).mockRejectedValue(
      new SiiConnectionError('Timeout de socket con maullin.sii.cl')
    );

    const useCase = new SubmitEnvioDteUseCase(mockAuthUseCase, mockSiiGateway);
    const invoice = getSignedInvoice('tenant-submit', 55);

    await expect(
      useCase.execute({
        tenantId: 'tenant-submit',
        invoices: [invoice],
        envioDteXml: '<EnvioDTE></EnvioDTE>',
        rutSender: Rut.of('15123456-9')
      })
    ).rejects.toThrow(SiiConnectionError);

    // Comprobación de regla de incertidumbre
    expect(invoice.estado).toBe(InvoiceStatus.UNKNOWN);
    expect(invoice.glosaRechazo).toContain('Timeout de socket');
  });
});
