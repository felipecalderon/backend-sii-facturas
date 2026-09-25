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
      findMany: vi.fn(),
      save: vi.fn()
    };

    resMock = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
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

  describe('getInvoiceXml (GET /invoices/:folio/xml)', () => {
    it('debe lanzar NotFoundException si la factura no existe', async () => {
      vi.mocked(invoiceRepositoryMock.findByFolio!).mockResolvedValue(null);

      await expect(
        controller.getInvoiceXml(
          'tenant-1',
          999,
          undefined,
          resMock as Response
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar NotFoundException si la factura existe pero no tiene XML firmado', async () => {
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

      vi.mocked(invoiceRepositoryMock.findByFolio!).mockResolvedValue(invoice);

      await expect(
        controller.getInvoiceXml('tenant-1', 105, '33', resMock as Response)
      ).rejects.toThrow(NotFoundException);
    });

    it('debe responder con Content-Type application/xml y el contenido firmado con tipoDte por defecto', async () => {
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
      invoice.sign('<Signature>firmado</Signature>');

      vi.mocked(invoiceRepositoryMock.findByFolio!).mockResolvedValue(invoice);

      await controller.getInvoiceXml(
        'tenant-1',
        105,
        undefined,
        resMock as Response
      );

      expect(invoiceRepositoryMock.findByFolio).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ code: 33 }),
        105
      );
      expect(resMock.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/xml; charset=iso-8859-1'
      );
      expect(resMock.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="dte-33-105.xml"'
      );
      expect(resMock.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(resMock.send).toHaveBeenCalledWith(
        '<Signature>firmado</Signature>'
      );
    });
  });

  describe('getInvoices (GET /invoices)', () => {
    it('debe listar facturas con filtros y calcular totalPages correctamente', async () => {
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
        fechaEmision: new Date('2026-09-01T00:00:00Z'),
        emisor: sampleIssuer,
        receptor: receiver,
        items: [item]
      });
      invoice.assignFolio(101);

      vi.mocked(invoiceRepositoryMock.findMany!).mockResolvedValue({
        items: [invoice],
        total: 25
      });

      const query = {
        page: 2,
        limit: 10,
        tipoDte: 33,
        estado: InvoiceStatus.FOLIO_ASSIGNED,
        desde: '2026-09-01',
        hasta: '2026-09-30'
      };

      const result = await controller.getInvoices('tenant-1', query);

      expect(invoiceRepositoryMock.findMany).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        tipoDte: expect.objectContaining({ code: 33 }),
        estado: InvoiceStatus.FOLIO_ASSIGNED,
        desde: new Date('2026-09-01'),
        hasta: new Date('2026-09-30'),
        page: 2,
        limit: 10
      });

      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(3); // Math.ceil(25 / 10) = 3
      expect(result.items).toHaveLength(1);
      expect(result.items[0].folio).toBe(101);
      expect(result.items[0].receptor.rut).toBe('55666777-2');
    });

    it('debe usar valores por defecto (page=1, limit=20) cuando no se envían parámetros', async () => {
      vi.mocked(invoiceRepositoryMock.findMany!).mockResolvedValue({
        items: [],
        total: 0
      });

      const result = await controller.getInvoices('tenant-1', {});

      expect(invoiceRepositoryMock.findMany).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        tipoDte: undefined,
        estado: undefined,
        desde: undefined,
        hasta: undefined,
        page: 1,
        limit: 20
      });

      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.items).toHaveLength(0);
    });
  });
});
