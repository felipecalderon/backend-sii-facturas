import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArgumentsHost, HttpStatus, BadRequestException } from '@nestjs/common';
import type { Response, Request } from 'express';
import { FiscalExceptionFilter } from './fiscal-exception.filter.js';
import { NoActiveCafError } from '../../../domain/folio/errors/folio-domain.error.js';
import { NoActiveCertificateError } from '../../../domain/certificate/errors/certificate-domain.error.js';
import {
  FiscalCalculationMismatchError,
  InvalidRutError
} from '../../../domain/dte/errors/fiscal-domain.error.js';
import {
  SiiConnectionError,
  SiiAuthenticationError
} from '../../../domain/sii/errors/sii-domain.error.js';

describe('FiscalExceptionFilter', () => {
  let filter: FiscalExceptionFilter;
  let responseMock: Partial<Response>;
  let requestMock: Partial<Request>;
  let hostMock: ArgumentsHost;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    filter = new FiscalExceptionFilter();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    responseMock = {
      status: statusMock
    };

    requestMock = {
      url: '/invoices'
    };

    hostMock = {
      switchToHttp: vi.fn().mockReturnValue({
        getResponse: () => responseMock as Response,
        getRequest: () => requestMock as Request
      })
    } as unknown as ArgumentsHost;
  });

  it('debe mapear NoActiveCafError a HTTP 412 (Precondition Failed)', () => {
    const error = new NoActiveCafError('tenant-15978960-8', 33);

    filter.catch(error, hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.PRECONDITION_FAILED);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.PRECONDITION_FAILED,
        error: 'Precondition Failed',
        message:
          "No existe un CAF activo para tenant 'tenant-15978960-8' y tipo DTE 33",
        path: '/invoices'
      })
    );
  });

  it('debe mapear NoActiveCertificateError a HTTP 412 (Precondition Failed)', () => {
    const error = new NoActiveCertificateError('tenant-15978960-8');

    filter.catch(error, hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.PRECONDITION_FAILED);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.PRECONDITION_FAILED,
        error: 'Precondition Failed',
        message:
          "No existe un certificado digital activo registrado para el tenant 'tenant-15978960-8'"
      })
    );
  });

  it('debe mapear FiscalCalculationMismatchError a HTTP 422 (Unprocessable Entity)', () => {
    const error = new FiscalCalculationMismatchError('montoIva', 1900, 1500);

    filter.catch(error, hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity'
      })
    );
  });

  it('debe mapear InvalidRutError a HTTP 400 (Bad Request)', () => {
    const error = new InvalidRutError('12345-K', 'Dígito verificador erróneo');

    filter.catch(error, hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request'
      })
    );
  });

  it('debe mapear SiiConnectionError a HTTP 504 (Gateway Timeout)', () => {
    const error = new SiiConnectionError(
      'Timeout al conectar con el servidor del SII'
    );

    filter.catch(error, hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.GATEWAY_TIMEOUT);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.GATEWAY_TIMEOUT,
        error: 'Gateway Timeout'
      })
    );
  });

  it('debe mapear SiiAuthenticationError a HTTP 502 (Bad Gateway)', () => {
    const error = new SiiAuthenticationError(
      'Semilla inválida o rechazo de autenticación'
    );

    filter.catch(error, hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'Bad Gateway'
      })
    );
  });

  it('debe preservar HttpException estándar de NestJS con su código y payload', () => {
    const error = new BadRequestException('El campo nombre es obligatorio');

    filter.catch(error, hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'El campo nombre es obligatorio'
      })
    );
  });
});
