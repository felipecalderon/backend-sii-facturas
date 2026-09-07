import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { InvoicesController } from './invoices.controller.js';
import { IssueInvoiceUseCase } from '../../application/use-cases/issue-invoice.use-case.js';
import { QueryEnvioStatusUseCase } from '../../application/use-cases/query-envio-status.use-case.js';
import { IssuerRepository } from '../../domain/dte/ports/issuer.repository.js';
import { InvoiceRepository } from '../../domain/dte/ports/invoice.repository.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';

describe('InvoicesController', () => {
  let controller: InvoicesController;
  let issueInvoiceUseCaseMock: Partial<IssueInvoiceUseCase>;
  let queryEnvioStatusUseCaseMock: Partial<QueryEnvioStatusUseCase>;
  let issuerRepositoryMock: Partial<IssuerRepository>;
  let invoiceRepositoryMock: Partial<InvoiceRepository>;
  let resMock: Partial<Response>;

  const sampleIssuer = Issuer.create({
    rut: Rut.of('76192456-7'),
    razonSocial: 'Empresa Emisora SpA',
    giro: 'Servicios de TI',
    actividadEconomica: 620100,
    direccion: 'Av. Providencia 1234',
    comuna: 'Providencia'
  });

  beforeEach(() => {
    issueInvoiceUseCaseMock = {
      execute: vi.fn()
    };

    queryEnvioStatusUseCaseMock = {
      execute: vi.fn()
    };

    issuerRepositoryMock = {
      findByTenantId: vi.fn(),
      save: vi.fn()
    };

    invoiceRepositoryMock = {
      findByFolio: vi.fn(),
      findByIdempotencyKey: vi.fn(),
      save: vi.fn()
    };

    resMock = {
      status: vi.fn().mockReturnThis()
    };

    controller = new InvoicesController(
      issueInvoiceUseCaseMock as IssueInvoiceUseCase,
      queryEnvioStatusUseCaseMock as QueryEnvioStatusUseCase,
      issuerRepositoryMock as IssuerRepository,
      invoiceRepositoryMock as InvoiceRepository
    );
  });

  describe('issueInvoice (POST /invoices)', () => {
    it('debe lanzar HTTP 412 si el emisor fiscal no ha sido configurado para el tenant', async () => {
      vi.mocked(issuerRepositoryMock.findByTenantId!).mockResolvedValue(null);

      const dto = {
        receptor: {
          rut: '55666777-2',
          razonSocial: 'Cliente SpA',
          giro: 'Comercio',
          direccion: 'Calle Falsa 123',
          comuna: 'Santiago'
        },
        items: [
          {
            linea: 1,
            nombre: 'Item 1',
            cantidad: 2,
            precioUnitario: 10000,
            descuentoPct: 10
          }
        ]
      };

      await expect(
        controller.issueInvoice(
          'tenant-sin-emisor',
          undefined,
          dto,
          resMock as Response
        )
      ).rejects.toThrow(HttpException);

      try {
        await controller.issueInvoice(
          'tenant-sin-emisor',
          undefined,
          dto,
          resMock as Response
        );
      } catch (err: unknown) {
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.PRECONDITION_FAILED
        );
      }
    });

    it('debe emitir factura con múltiples ítems, cantidades y descuentos en porcentaje retornando HTTP 201', async () => {
      vi.mocked(issuerRepositoryMock.findByTenantId!).mockResolvedValue(
        sampleIssuer
      );

      const receiver = Receiver.create({
        rut: Rut.of('55666777-2'),
        razonSocial: 'Cliente SpA',
        giro: 'Comercio',
        direccion: 'Calle Falsa 123',
        comuna: 'Santiago'
      });

      const invoiceItem = InvoiceItem.create({
        linea: 1,
        nombre: 'Item con Descuento',
        cantidad: Money.fromDecimal(2.5, 'CLP'),
        precioUnitario: Money.fromDecimal(10000, 'CLP'),
        descuentoPct: 10
      });

      const invoiceDraft = Invoice.createDraft({
        tenantId: 'tenant-1',
        fechaEmision: new Date(),
        emisor: sampleIssuer,
        receptor: receiver,
        items: [invoiceItem]
      });

      vi.mocked(issueInvoiceUseCaseMock.execute!).mockResolvedValue({
        invoice: invoiceDraft,
        folio: 101,
        trackId: 'track-999',
        estado: InvoiceStatus.SUBMITTED,
        isDuplicate: false
      });

      const dto = {
        receptor: {
          rut: '55666777-2',
          razonSocial: 'Cliente SpA',
          giro: 'Comercio',
          direccion: 'Calle Falsa 123',
          comuna: 'Santiago'
        },
        items: [
          {
            linea: 1,
            nombre: 'Item con Descuento',
            cantidad: 2.5,
            precioUnitario: 10000,
            descuentoPct: 10
          }
        ]
      };

      const result = await controller.issueInvoice(
        'tenant-1',
        'key-123',
        dto,
        resMock as Response
      );

      expect(resMock.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result.folio).toBe(101);
      expect(result.trackId).toBe('track-999');
      expect(result.isDuplicate).toBe(false);
      expect(result.totales).toBeDefined();
    });

    it('debe retornar HTTP 200 cuando el documento ya fue emitido por idempotencia', async () => {
      vi.mocked(issuerRepositoryMock.findByTenantId!).mockResolvedValue(
        sampleIssuer
      );

      const receiver = Receiver.create({
        rut: Rut.of('55666777-2'),
        razonSocial: 'Cliente SpA',
        giro: 'Comercio',
        direccion: 'Calle Falsa 123',
        comuna: 'Santiago'
      });

      const invoiceItem = InvoiceItem.create({
        linea: 1,
        nombre: 'Item 1',
        cantidad: Money.fromDecimal(1, 'CLP'),
        precioUnitario: Money.fromDecimal(5000, 'CLP')
      });

      const invoiceDraft = Invoice.createDraft({
        tenantId: 'tenant-1',
        fechaEmision: new Date(),
        emisor: sampleIssuer,
        receptor: receiver,
        items: [invoiceItem]
      });

      vi.mocked(issueInvoiceUseCaseMock.execute!).mockResolvedValue({
        invoice: invoiceDraft,
        folio: 101,
        trackId: 'track-999',
        estado: InvoiceStatus.SUBMITTED,
        isDuplicate: true
      });

      const dto = {
        receptor: {
          rut: '55666777-2',
          razonSocial: 'Cliente SpA',
          giro: 'Comercio',
          direccion: 'Calle Falsa 123',
          comuna: 'Santiago'
        },
        items: [
          {
            linea: 1,
            nombre: 'Item 1',
            cantidad: 1,
            precioUnitario: 5000
          }
        ]
      };

      const result = await controller.issueInvoice(
        'tenant-1',
        'key-duplicada',
        dto,
        resMock as Response
      );

      expect(resMock.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result.isDuplicate).toBe(true);
    });
  });

  describe('getInvoiceStatus (GET /invoices/:folio/status)', () => {
    it('debe lanzar NotFoundException si no existe la factura para el tenant y folio', async () => {
      vi.mocked(invoiceRepositoryMock.findByFolio!).mockResolvedValue(null);

      await expect(
        controller.getInvoiceStatus('tenant-1', 999)
      ).rejects.toThrow(NotFoundException);
    });

    it('debe consultar y sincronizar estado ante el SII si la factura tiene trackId', async () => {
      const receiver = Receiver.create({
        rut: Rut.of('55666777-2'),
        razonSocial: 'Cliente SpA',
        giro: 'Comercio',
        direccion: 'Calle Falsa 123',
        comuna: 'Santiago'
      });

      const item = InvoiceItem.create({
        linea: 1,
        nombre: 'Item 1',
        cantidad: Money.fromDecimal(1, 'CLP'),
        precioUnitario: Money.fromDecimal(1000, 'CLP')
      });

      const invoice = Invoice.createDraft({
        tenantId: 'tenant-1',
        fechaEmision: new Date(),
        emisor: sampleIssuer,
        receptor: receiver,
        items: [item]
      });
      invoice.assignFolio(105);
      invoice.stampTed('<TED>test</TED>');
      invoice.setDteXml('<DTE>test</DTE>');
      invoice.sign('<Signature>test</Signature>');
      invoice.markPersisted();
      invoice.markSubmitted('track-12345');

      vi.mocked(invoiceRepositoryMock.findByFolio!).mockResolvedValue(invoice);
      vi.mocked(queryEnvioStatusUseCaseMock.execute!).mockResolvedValue({
        trackId: 'track-12345',
        status: 'EPR',
        glosa: 'Envio Recibido Conforme'
      });

      const result = await controller.getInvoiceStatus('tenant-1', 105);

      expect(result.folio).toBe(105);
      expect(result.trackId).toBe('track-12345');
      expect(result.siiStatus).toBe('EPR');
      expect(result.glosa).toBe('Envio Recibido Conforme');
      expect(queryEnvioStatusUseCaseMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          trackId: 'track-12345'
        })
      );
    });
  });
});
