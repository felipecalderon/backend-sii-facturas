import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { CafsController } from './cafs.controller.js';
import { ImportCafUseCase } from '../../application/use-cases/import-caf.use-case.js';
import {
  FolioRepository,
  FolioStatus
} from '../../domain/folio/ports/folio.repository.js';
import type { UploadedFilePayload } from '../../infrastructure/http/interfaces/uploaded-file.interface.js';

describe('CafsController', () => {
  let controller: CafsController;
  let importCafUseCaseMock: Partial<ImportCafUseCase>;
  let folioRepositoryMock: Partial<FolioRepository>;
  let resMock: Partial<Response>;

  beforeEach(() => {
    importCafUseCaseMock = {
      execute: vi.fn().mockResolvedValue({
        tenantId: 'tenant-123',
        tipoDte: 33,
        rangoDesde: 1,
        rangoHasta: 100,
        fechaAutorizacion: new Date('2025-01-15'),
        rutEmisor: '76123456-7',
        totalFolios: 100,
        created: true
      })
    };

    folioRepositoryMock = {
      getFolioStatus: vi.fn().mockResolvedValue({
        rangoDesde: 1,
        rangoHasta: 100,
        ultimoAsignado: 10,
        disponibles: 90,
        activo: true
      } as FolioStatus)
    };

    resMock = {
      status: vi.fn().mockReturnThis()
    };

    controller = new CafsController(
      importCafUseCaseMock as ImportCafUseCase,
      folioRepositoryMock as FolioRepository
    );
  });

  describe('importCaf', () => {
    it('debe importar un archivo CAF XML exitosamente vía multipart', async () => {
      const xmlPayload = '<AUTORIZACION><CAF>test</CAF></AUTORIZACION>';
      const file: UploadedFilePayload = {
        originalname: 'folio_33.xml',
        mimetype: 'application/xml',
        buffer: Buffer.from(xmlPayload, 'utf-8'),
        size: xmlPayload.length
      };

      const result = await controller.importCaf(
        'tenant-123',
        file,
        resMock as Response
      );

      expect(importCafUseCaseMock.execute).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        xmlContent: xmlPayload
      });
      expect(result.tipoDte).toBe(33);
      expect(result.totalFolios).toBe(100);
      expect(result.created).toBe(true);
      expect(resMock.status).toHaveBeenCalledWith(201);
    });

    it('debe responder HTTP 200 cuando el CAF ya estaba registrado (reimportación idéntica)', async () => {
      vi.mocked(importCafUseCaseMock.execute!).mockResolvedValue({
        tenantId: 'tenant-123',
        tipoDte: 33,
        rangoDesde: 1,
        rangoHasta: 100,
        fechaAutorizacion: new Date('2025-01-15'),
        rutEmisor: '76123456-7',
        totalFolios: 100,
        created: false
      });

      const file: UploadedFilePayload = {
        originalname: 'folio_33.xml',
        mimetype: 'application/xml',
        buffer: Buffer.from('<AUTORIZACION><CAF>test</CAF></AUTORIZACION>'),
        size: 39
      };

      const result = await controller.importCaf(
        'tenant-123',
        file,
        resMock as Response
      );

      expect(result.created).toBe(false);
      expect(resMock.status).toHaveBeenCalledWith(200);
    });

    it('debe arrojar BadRequestException si no se envía archivo en campo file', async () => {
      await expect(
        controller.importCaf('tenant-123', undefined, resMock as Response)
      ).rejects.toThrow(BadRequestException);
    });

    it('debe arrojar BadRequestException si el buffer del archivo está vacío', async () => {
      const emptyFile: UploadedFilePayload = {
        originalname: 'empty.xml',
        mimetype: 'application/xml',
        buffer: Buffer.alloc(0),
        size: 0
      };

      await expect(
        controller.importCaf('tenant-123', emptyFile, resMock as Response)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFolioStatus', () => {
    it('debe retornar el estado de los folios del CAF activo', async () => {
      const result = await controller.getFolioStatus('tenant-123', {
        tipoDte: 33
      });

      expect(folioRepositoryMock.getFolioStatus).toHaveBeenCalled();
      expect(result.tenantId).toBe('tenant-123');
      expect(result.tipoDte).toBe(33);
      expect(result.disponibles).toBe(90);
      expect(result.ultimoAsignado).toBe(10);
    });

    it('debe arrojar NotFoundException cuando no hay CAF activo para el tipo DTE', async () => {
      vi.mocked(folioRepositoryMock.getFolioStatus!).mockResolvedValue(null);

      await expect(
        controller.getFolioStatus('tenant-123', { tipoDte: 34 })
      ).rejects.toThrow(NotFoundException);
    });
  });
});
