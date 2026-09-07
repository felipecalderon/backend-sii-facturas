import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import type { Response, Request } from 'express';
import {
  DomainError,
  FiscalValidationError,
  FiscalCalculationMismatchError,
  InvalidRutError,
  InvalidMoneyError
} from '../../../domain/dte/errors/fiscal-domain.error.js';
import {
  NoActiveCafError,
  FoliosExhaustedError,
  InvalidCafXmlError,
  InvalidFolioSequenceError,
  TenantMismatchError
} from '../../../domain/folio/errors/folio-domain.error.js';
import {
  NoActiveCertificateError,
  CertificateExpiredError,
  InvalidCertificatePasswordError,
  InvalidCertificateError,
  CertificateEncryptionError
} from '../../../domain/certificate/errors/certificate-domain.error.js';
import {
  SiiAuthenticationError,
  SiiConnectionError,
  SiiSubmissionError,
  SiiError
} from '../../../domain/sii/errors/sii-domain.error.js';

@Catch()
export class FiscalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(FiscalExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? exception.name;
      } else {
        message = res as string;
        error = exception.name;
      }
    } else if (exception instanceof DomainError) {
      const mapping = this.mapDomainErrorToHttp(exception);
      status = mapping.status;
      error = mapping.error;
      message = exception.message;
      this.logger.warn(
        `Fiscal Domain Error [${exception.constructor.name}]: ${exception.message}`
      );
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled Exception: ${exception.message}`,
        exception.stack
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString()
    });
  }

  private mapDomainErrorToHttp(error: DomainError): {
    status: HttpStatus;
    error: string;
  } {
    // 412: Precondiciones requeridas para operar (CAF o Certificado ausente/vencido)
    if (
      error instanceof NoActiveCafError ||
      error instanceof NoActiveCertificateError ||
      error instanceof CertificateExpiredError
    ) {
      return {
        status: HttpStatus.PRECONDITION_FAILED,
        error: 'Precondition Failed'
      };
    }

    // 409 / 422: Folios o cálculo
    if (error instanceof FoliosExhaustedError) {
      return { status: HttpStatus.CONFLICT, error: 'Conflict' };
    }
    if (
      error instanceof FiscalCalculationMismatchError ||
      error instanceof FiscalValidationError
    ) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity'
      };
    }

    // 403: Tenant mismatch
    if (error instanceof TenantMismatchError) {
      return { status: HttpStatus.FORBIDDEN, error: 'Forbidden' };
    }

    // 400: Validaciones de formato/sintaxis de entrada
    if (
      error instanceof InvalidRutError ||
      error instanceof InvalidMoneyError ||
      error instanceof InvalidCafXmlError ||
      error instanceof InvalidFolioSequenceError ||
      error instanceof InvalidCertificatePasswordError ||
      error instanceof InvalidCertificateError
    ) {
      return { status: HttpStatus.BAD_REQUEST, error: 'Bad Request' };
    }

    // 502 / 504: Gateway SII
    if (error instanceof SiiConnectionError) {
      return { status: HttpStatus.GATEWAY_TIMEOUT, error: 'Gateway Timeout' };
    }
    if (
      error instanceof SiiAuthenticationError ||
      error instanceof SiiSubmissionError ||
      error instanceof SiiError
    ) {
      return { status: HttpStatus.BAD_GATEWAY, error: 'Bad Gateway' };
    }

    if (error instanceof CertificateEncryptionError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error'
      };
    }

    // Por defecto para cualquier otro DomainError
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      error: 'Unprocessable Entity'
    };
  }
}
