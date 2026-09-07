import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Query,
  Inject,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Res
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiQuery
} from '@nestjs/swagger';
import {
  ImportCafUseCase,
  ImportCafResult
} from '../../application/use-cases/import-caf.use-case.js';
import {
  FOLIO_REPOSITORY_TOKEN,
  type FolioRepository,
  FolioStatus
} from '../../domain/folio/ports/folio.repository.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { TenantId } from '../../infrastructure/http/decorators/tenant-id.decorator.js';
import { FolioStatusQueryDto } from './dto/folio-status-query.dto.js';
import type { UploadedFilePayload } from '../../infrastructure/http/interfaces/uploaded-file.interface.js';

export interface FolioStatusResponse extends FolioStatus {
  tenantId: string;
  tipoDte: number;
}

@ApiTags('cafs')
@Controller()
export class CafsController {
  constructor(
    private readonly importCafUseCase: ImportCafUseCase,
    @Inject(FOLIO_REPOSITORY_TOKEN)
    private readonly folioRepository: FolioRepository
  ) {}

  @Post('cafs')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Importar CAF (Código de Autorización de Folios) en formato XML',
    description:
      'Carga el archivo CAF emitido por el SII en formato XML vía multipart/form-data. ' +
      'Extrae el rango autorizado y la clave privada RSA asociada para timbrar TEDs. ' +
      'Si el CAF ya fue importado para el tenant, la operación es idempotente y no modifica el estado de folios.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo XML del CAF provisto por el SII',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo XML del CAF'
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description:
      'CAF parseado, validado y registrado exitosamente por primera vez.'
  })
  @ApiResponse({
    status: 200,
    description:
      'CAF idéntico ya registrado para el tenant; no se realizaron cambios de estado.'
  })
  @ApiResponse({
    status: 400,
    description: 'Archivo no provisto o XML de CAF malformado/inválido.'
  })
  public async importCaf(
    @TenantId() tenantId: string,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @Res({ passthrough: true }) res: Response
  ): Promise<ImportCafResult> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException(
        'El archivo CAF (XML) es obligatorio en el campo "file"'
      );
    }

    const xmlContent = file.buffer.toString('utf-8');

    const result = await this.importCafUseCase.execute({
      tenantId,
      xmlContent
    });

    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Get('folios/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consultar estado y disponibilidad de folios',
    description:
      'Retorna el rango autorizado, el último folio asignado y los folios restantes disponibles en el CAF activo del tenant.'
  })
  @ApiQuery({
    name: 'tipoDte',
    type: Number,
    required: true,
    description:
      'Código numérico del DTE (ej: 33 = Factura, 34 = Exenta, 61 = Nota de Crédito)',
    example: 33
  })
  @ApiResponse({
    status: 200,
    description: 'Estado actual de folios del CAF activo.'
  })
  @ApiResponse({
    status: 404,
    description:
      'No existe un CAF activo para el tipo DTE y tenant solicitados.'
  })
  public async getFolioStatus(
    @TenantId() tenantId: string,
    @Query() query: FolioStatusQueryDto
  ): Promise<FolioStatusResponse> {
    const tipoDteVo = TipoDte.of(query.tipoDte);
    const status = await this.folioRepository.getFolioStatus(
      tenantId,
      tipoDteVo
    );

    if (!status) {
      throw new NotFoundException(
        `No existe un CAF activo para el tipo DTE ${query.tipoDte} en el tenant '${tenantId}'`
      );
    }

    return {
      tenantId,
      tipoDte: query.tipoDte,
      ...status
    };
  }
}
