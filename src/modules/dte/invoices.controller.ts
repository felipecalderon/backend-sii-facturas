import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Inject,
  HttpStatus,
  HttpException,
  NotFoundException,
  ParseIntPipe,
  Res
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';
import { IssueInvoiceUseCase } from '../../application/use-cases/issue-invoice.use-case.js';
import { QueryEnvioStatusUseCase } from '../../application/use-cases/query-envio-status.use-case.js';
import {
  ISSUER_REPOSITORY_TOKEN,
  type IssuerRepository
} from '../../domain/dte/ports/issuer.repository.js';
import {
  INVOICE_REPOSITORY_TOKEN,
  type InvoiceRepository
} from '../../domain/dte/ports/invoice.repository.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import type { SiiEnvironment } from '../../domain/sii/values/sii-domain.types.js';
import { TenantId } from '../../infrastructure/http/decorators/tenant-id.decorator.js';
import { IdempotencyKey } from '../../infrastructure/http/decorators/idempotency-key.decorator.js';
import { IssueInvoiceDto } from './dto/issue-invoice.dto.js';
import { IssueInvoiceResponseDto } from './dto/issue-invoice-response.dto.js';
import { InvoiceStatusResponseDto } from './dto/invoice-status-response.dto.js';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly issueInvoiceUseCase: IssueInvoiceUseCase,
    private readonly queryEnvioStatusUseCase: QueryEnvioStatusUseCase,
    @Inject(ISSUER_REPOSITORY_TOKEN)
    private readonly issuerRepository: IssuerRepository,
    @Inject(INVOICE_REPOSITORY_TOKEN)
    private readonly invoiceRepository: InvoiceRepository
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Emitir Documento Tributario Electrónico (Factura Electrónica)',
    description:
      'Orquesta el ciclo completo de facturación: asignación atómica de folio, cálculo de totales con múltiples ítems ' +
      'y descuentos en porcentaje, timbrado TED, armado de XML DTE con XSD oficial, firma digital en memoria, persistencia previa ' +
      'y transmisión directa al SII. Soporta idempotencia vía header Idempotency-Key para prevenir duplicación de folios.'
  })
  @ApiHeader({
    name: 'x-tenant-id',
    required: true,
    description: 'Identificador del tenant emisor'
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Clave única de idempotencia para evitar duplicados'
  })
  @ApiResponse({
    status: 201,
    description: 'Factura emitida y transmitida exitosamente al SII.',
    type: IssueInvoiceResponseDto
  })
  @ApiResponse({
    status: 200,
    description: 'Factura previamente procesada devuelta por idempotencia.',
    type: IssueInvoiceResponseDto
  })
  @ApiResponse({
    status: 412,
    description:
      'El emisor fiscal no ha sido configurado previamente para el tenant.'
  })
  @ApiResponse({
    status: 422,
    description:
      'Inconsistencia en cálculos fiscales, folios agotados o RUT inválido.'
  })
  public async issueInvoice(
    @TenantId() tenantId: string,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body() dto: IssueInvoiceDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<IssueInvoiceResponseDto> {
    // 1. Obtener la configuración del emisor para este tenant
    const emisor = await this.issuerRepository.findByTenantId(tenantId);
    if (!emisor) {
      throw new HttpException(
        `El emisor fiscal no ha sido configurado para el tenant '${tenantId}'. Debe configurarlo previamente vía PUT /tenants/issuer.`,
        HttpStatus.PRECONDITION_FAILED
      );
    }

    // 2. Construir la entidad Receiver a partir del DTO
    const receptor = Receiver.create({
      rut: Rut.of(dto.receptor.rut),
      razonSocial: dto.receptor.razonSocial,
      giro: dto.receptor.giro,
      direccion: dto.receptor.direccion,
      comuna: dto.receptor.comuna,
      ciudad: dto.receptor.ciudad,
      correo: dto.receptor.correo,
      contacto: dto.receptor.contacto
    });

    // 3. Mapear los ítems con soporte de cantidades y descuentos
    const items = dto.items.map((item) =>
      InvoiceItem.create({
        linea: item.linea,
        nombre: item.nombre,
        descripcion: item.descripcion,
        cantidad: Money.fromDecimal(item.cantidad, 'CLP'),
        precioUnitario: Money.fromDecimal(item.precioUnitario, 'CLP'),
        esExento: item.esExento,
        descuentoPct: item.descuentoPct,
        descuentoMonto:
          item.descuentoMonto !== undefined
            ? Money.fromDecimal(item.descuentoMonto, 'CLP')
            : undefined
      })
    );

    // 4. Determinar entorno SII
    const env: SiiEnvironment =
      dto.environment ??
      ((process.env.SII_ENVIRONMENT as SiiEnvironment) || 'CERTIFICATION');

    // 5. Ejecutar caso de uso de emisión
    const result = await this.issueInvoiceUseCase.execute({
      tenantId,
      fechaEmision: dto.fechaEmision ? new Date(dto.fechaEmision) : undefined,
      emisor,
      receptor,
      items,
      tasaIva: dto.tasaIva,
      idempotencyKey,
      environment: env,
      validateXsd: dto.validateXsd ?? true
    });

    // 6. Configurar código de respuesta HTTP según idempotencia
    if (result.isDuplicate) {
      res.status(HttpStatus.OK);
    } else {
      res.status(HttpStatus.CREATED);
    }

    return {
      folio: result.folio,
      trackId: result.trackId,
      estado: result.estado,
      isDuplicate: result.isDuplicate,
      totales: {
        montoNeto: result.invoice.totales.montoNeto.toClpInteger(),
        montoExento: result.invoice.totales.montoExento.toClpInteger(),
        tasaIva: result.invoice.totales.tasaIva,
        montoIva: result.invoice.totales.montoIva.toClpInteger(),
        montoTotal: result.invoice.totales.montoTotal.toClpInteger(),
        currency: result.invoice.totales.montoTotal.currency
      }
    };
  }

  @Get(':folio/status')
  @ApiOperation({
    summary: 'Consultar y sincronizar estado del DTE con el SII',
    description:
      'Recupera la factura por su folio correlativo y, si cuenta con Track ID, consulta en línea ' +
      'el estado del envío ante el SII actualizando automáticamente el estado del documento (EPR, REC, RECH).'
  })
  @ApiParam({
    name: 'folio',
    type: Number,
    description: 'Folio correlativo del documento',
    example: 105
  })
  @ApiQuery({
    name: 'tipoDte',
    type: Number,
    required: false,
    description:
      'Código del tipo de DTE (por defecto 33 = Factura Electrónica)',
    example: 33
  })
  @ApiResponse({
    status: 200,
    description: 'Estado fiscal del documento y respuesta del SII.',
    type: InvoiceStatusResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'No se encontró la factura con el folio especificado.'
  })
  public async getInvoiceStatus(
    @TenantId() tenantId: string,
    @Param('folio', ParseIntPipe) folio: number,
    @Query('tipoDte') tipoDteParam?: string
  ): Promise<InvoiceStatusResponseDto> {
    const tipoDteCode = tipoDteParam ? parseInt(tipoDteParam, 10) : 33;
    const tipoDteVo = TipoDte.of(tipoDteCode);

    const invoice = await this.invoiceRepository.findByFolio(
      tenantId,
      tipoDteVo,
      folio
    );

    if (!invoice) {
      throw new NotFoundException(
        `No se encontró la factura con folio ${folio} y tipo DTE ${tipoDteCode} para el tenant '${tenantId}'`
      );
    }

    let siiStatus: string | undefined;
    let glosa: string | undefined;

    // Si la factura tiene trackId, consultar en línea al SII para sincronizar estado
    if (invoice.trackId) {
      try {
        const env: SiiEnvironment =
          (process.env.SII_ENVIRONMENT as SiiEnvironment) || 'CERTIFICATION';

        const queryResult = await this.queryEnvioStatusUseCase.execute({
          tenantId,
          trackId: invoice.trackId,
          rutCompany: invoice.emisor.rut,
          invoices: [invoice],
          environment: env
        });

        siiStatus = queryResult.status;
        glosa = queryResult.glosa;
      } catch {
        // En caso de falla transitoria con el SII, mantenemos el estado local previamente guardado
      }
    }

    return {
      folio: invoice.folio!,
      tenantId,
      tipoDte: invoice.tipoDte.code,
      trackId: invoice.trackId,
      estado: invoice.estado,
      siiStatus,
      glosa: glosa ?? invoice.glosaRechazo
    };
  }
}
