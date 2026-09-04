import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse
} from '@nestjs/swagger';
import {
  UploadCertificateUseCase,
  UploadCertificateResult
} from '../../application/use-cases/upload-certificate.use-case.js';
import { TenantId } from '../../infrastructure/http/decorators/tenant-id.decorator.js';
import { UploadCertificateDto } from './dto/upload-certificate.dto.js';
import type { UploadedFilePayload } from '../../infrastructure/http/interfaces/uploaded-file.interface.js';

@ApiTags('certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly uploadCertificateUseCase: UploadCertificateUseCase
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Cargar y cifrar certificado digital (.p12 / .pfx)',
    description:
      'Carga el certificado digital del contribuyente, valida su vigencia y contraseña en memoria, ' +
      'y lo almacena cifrado con AES-256-GCM en la base de datos (cero persistencia en disco). ' +
      'Este certificado será utilizado en las operaciones posteriores de firma DTE y autenticación ante el SII.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo binario del certificado (.p12/.pfx) y contraseña',
    schema: {
      type: 'object',
      required: ['file', 'password'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo .p12 o .pfx del certificado digital'
        },
        password: {
          type: 'string',
          description: 'Contraseña para abrir el contenedor PKCS#12'
        },
        rutTitular: {
          type: 'string',
          description:
            'RUT del titular (opcional, necesario solo si no se encuentra en el CN del certificado)',
          example: '12345678-5'
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Certificado cargado, validado y cifrado exitosamente.'
  })
  @ApiResponse({
    status: 400,
    description:
      'Falta de parámetros obligatorios, contraseña inválida o archivo corrupto.'
  })
  public async uploadCertificate(
    @TenantId() tenantId: string,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @Body() dto: UploadCertificateDto
  ): Promise<UploadCertificateResult> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException(
        'El archivo de certificado (.p12/.pfx) es obligatorio en el campo "file"'
      );
    }

    return this.uploadCertificateUseCase.execute({
      tenantId,
      p12Buffer: file.buffer,
      password: dto.password,
      rutTitular: dto.rutTitular
    });
  }
}
