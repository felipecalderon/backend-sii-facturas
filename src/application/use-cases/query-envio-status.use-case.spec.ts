import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryEnvioStatusUseCase } from './query-envio-status.use-case.js';
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

describe('QueryEnvioStatusUseCase', () => {
  let mockAuthUseCase: AuthenticateSiiUseCase;
  let mockSiiGateway: SiiGateway;

  const getSubmittedInvoice = (tenantId = 'tenant-query'): Invoice => {
    const inv = Invoice.createDraft({
      tenantId,
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor SpA',
        giro: 'Servicios',
        actividadEconomica: 620100,
        direccion: 'Calle 1',
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
          nombre: 'Suscripción',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(15000)
        })
      ]
    });

    inv.assignFolio(77);
    inv.stampTed('<TED></TED>');
    inv.setDteXml('<DTE></DTE>');
    inv.sign('<DTE><Signature></Signature></DTE>');
    inv.markSubmitted('1234567890');
    return inv;
  };

  beforeEach(() => {
    mockAuthUseCase = {
      execute: vi.fn().mockResolvedValue({
        token: 'TOKEN_XYZ',
        environment: 'CERTIFICATION'
      })
    } as any;

    mockSiiGateway = {
      getSeed: vi.fn(),
      getToken: vi.fn(),
      sendDte: vi.fn(),
      querySendStatus: vi.fn().mockResolvedValue({
        status: 'EPR',
        glosa: 'Envio Procesado y Aceptado',
        rawResponse: '<SOAP-ENV:Envelope>respuesta completa</SOAP-ENV:Envelope>'
      })
    };
  });

  it('debe consultar estado y transicionar facturas a ACCEPTED si el estado es EPR', async () => {
    const useCase = new QueryEnvioStatusUseCase(
      mockAuthUseCase,
      mockSiiGateway
    );
    const invoice = getSubmittedInvoice('tenant-query');

    const result = await useCase.execute({
      tenantId: 'tenant-query',
      trackId: '1234567890',
      rutCompany: Rut.of('76123456-0'),
      invoices: [invoice],
      environment: 'CERTIFICATION'
    });

    expect(result.status).toBe('EPR');
    expect(result.glosa).toBe('Envio Procesado y Aceptado');
    expect(result.rawResponse).toBe(
      '<SOAP-ENV:Envelope>respuesta completa</SOAP-ENV:Envelope>'
    );
    expect(invoice.estado).toBe(InvoiceStatus.ACCEPTED);
  });

  it('debe transicionar facturas a REJECTED si el SII responde RECH', async () => {
    vi.mocked(mockSiiGateway.querySendStatus).mockResolvedValue({
      status: 'RECH',
      glosa: 'Caratula no cumple formato schema'
    });

    const useCase = new QueryEnvioStatusUseCase(
      mockAuthUseCase,
      mockSiiGateway
    );
    const invoice = getSubmittedInvoice('tenant-query');

    const result = await useCase.execute({
      tenantId: 'tenant-query',
      trackId: '1234567890',
      rutCompany: Rut.of('76123456-0'),
      invoices: [invoice]
    });

    expect(result.status).toBe('RECH');
    expect(invoice.estado).toBe(InvoiceStatus.REJECTED);
    expect(invoice.glosaRechazo).toBe('Caratula no cumple formato schema');
  });

  it('debe reconciliar a REJECTED una factura marcada ACCEPTED por una consulta previa', async () => {
    vi.mocked(mockSiiGateway.querySendStatus).mockResolvedValue({
      status: 'RECH'
    });

    const useCase = new QueryEnvioStatusUseCase(
      mockAuthUseCase,
      mockSiiGateway
    );
    const invoice = getSubmittedInvoice('tenant-query');
    invoice.markAccepted();

    const result = await useCase.execute({
      tenantId: 'tenant-query',
      trackId: '1234567890',
      rutCompany: Rut.of('76123456-0'),
      invoices: [invoice]
    });

    expect(result.status).toBe('RECH');
    expect(invoice.estado).toBe(InvoiceStatus.REJECTED);
    expect(invoice.glosaRechazo).toBe('Envío rechazado por SII');
  });

  it('debe mantener facturas en SUBMITTED si el SII responde REC (En proceso)', async () => {
    vi.mocked(mockSiiGateway.querySendStatus).mockResolvedValue({
      status: 'REC',
      glosa: 'Envio Recibido en cola'
    });

    const useCase = new QueryEnvioStatusUseCase(
      mockAuthUseCase,
      mockSiiGateway
    );
    const invoice = getSubmittedInvoice('tenant-query');

    const result = await useCase.execute({
      tenantId: 'tenant-query',
      trackId: '1234567890',
      rutCompany: Rut.of('76123456-0'),
      invoices: [invoice]
    });

    expect(result.status).toBe('REC');
    expect(invoice.estado).toBe(InvoiceStatus.SUBMITTED);
  });

  it('debe validar coincidencia de tenantId en facturas', async () => {
    const useCase = new QueryEnvioStatusUseCase(
      mockAuthUseCase,
      mockSiiGateway
    );
    const invoice = getSubmittedInvoice('tenant-query');

    await expect(
      useCase.execute({
        tenantId: 'otro-tenant',
        trackId: '1234567890',
        rutCompany: Rut.of('76123456-0'),
        invoices: [invoice]
      })
    ).rejects.toThrow(TenantMismatchError);
  });

  it('debe rechazar trackId vacío', async () => {
    const useCase = new QueryEnvioStatusUseCase(
      mockAuthUseCase,
      mockSiiGateway
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-query',
        trackId: '',
        rutCompany: Rut.of('76123456-0')
      })
    ).rejects.toThrow(FiscalValidationError);
  });
});
