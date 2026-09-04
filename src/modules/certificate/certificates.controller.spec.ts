import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CertificatesController } from './certificates.controller.js';
import { UploadCertificateUseCase } from '../../application/use-cases/upload-certificate.use-case.js';
import type { UploadedFilePayload } from '../../infrastructure/http/interfaces/uploaded-file.interface.js';

describe('CertificatesController', () => {
  let controller: CertificatesController;
  let useCaseMock: Partial<UploadCertificateUseCase>;

  beforeEach(() => {
    useCaseMock = {
      execute: vi.fn().mockResolvedValue({
        tenantId: 'tenant-123',
        rutTitular: '12345678-5',
        validFrom: new Date('2025-01-01'),
        validTo: new Date('2028-01-01'),
        subject: 'CN=Juan Perez, C=CL'
      })
    };

    controller = new CertificatesController(
      useCaseMock as UploadCertificateUseCase
    );
  });

  it('debe procesar exitosamente la carga del certificado vía multipart', async () => {
    const file: UploadedFilePayload = {
      originalname: 'cert.p12',
      mimetype: 'application/x-pkcs12',
      buffer: Buffer.from('mock-p12-content'),
      size: 16
    };

    const result = await controller.uploadCertificate('tenant-123', file, {
      password: 'mypassword',
      rutTitular: '12345678-5'
    });

    expect(useCaseMock.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-123',
      p12Buffer: file.buffer,
      password: 'mypassword',
      rutTitular: '12345678-5'
    });
    expect(result.tenantId).toBe('tenant-123');
    expect(result.rutTitular).toBe('12345678-5');
  });

  it('debe arrojar BadRequestException si no se adjunta el archivo', async () => {
    await expect(
      controller.uploadCertificate('tenant-123', undefined, {
        password: 'mypassword'
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('debe arrojar BadRequestException si el buffer del archivo está vacío', async () => {
    const emptyFile: UploadedFilePayload = {
      originalname: 'cert.p12',
      mimetype: 'application/x-pkcs12',
      buffer: Buffer.alloc(0),
      size: 0
    };

    await expect(
      controller.uploadCertificate('tenant-123', emptyFile, {
        password: 'mypassword'
      })
    ).rejects.toThrow(BadRequestException);
  });
});
