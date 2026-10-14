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
  Res,
  Logger
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
import { GenerateDtePdfUseCase } from '../../application/use-cases/generate-dte-pdf.use-case.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
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
import { QueryInvoicesDto } from './dto/query-invoices.dto.js';
import { PaginatedInvoicesResponseDto } from './dto/paginated-invoices-response.dto.js';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  private readonly logger = new Logger(InvoicesController.name);

  constructor(
    private readonly issueInvoiceUseCase: IssueInvoiceUseCase,
    private readonly queryEnvioStatusUseCase: QueryEnvioStatusUseCase,
    private readonly generateDtePdfUseCase: GenerateDtePdfUseCase,
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

  @Get()
  @ApiOperation({
    summary: 'Listar facturas emitidas con filtros y paginación',
    description:
      'Recupera el historial de documentos emitidos para el tenant actual, permitiendo filtrar por tipo de DTE, estado del documento y rango de fechas de emisión, ordenados cronológicamente de forma descendente.'
  })
  @ApiResponse({
    status: 200,
    description: 'Listado paginado de facturas emitidas.',
    type: PaginatedInvoicesResponseDto
  })
  public async getInvoices(
    @TenantId() tenantId: string,
    @Query() query: QueryInvoicesDto
  ): Promise<PaginatedInvoicesResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result = await this.invoiceRepository.findMany({
      tenantId,
      tipoDte: query.tipoDte ? TipoDte.of(query.tipoDte) : undefined,
      estado: query.estado,
      desde: query.desde ? new Date(query.desde) : undefined,
      hasta: query.hasta ? new Date(query.hasta) : undefined,
      page,
      limit
    });

    const totalPages = Math.ceil(result.total / limit);

    return {
      items: result.items.map((inv) => ({
        folio: inv.folio!,
        tipoDte: inv.tipoDte.code,
        fechaEmision: inv.fechaEmision,
        receptor: {
          rut: inv.receptor.rut.toCanonical(),
          razonSocial: inv.receptor.razonSocial
        },
        totales: {
          montoNeto: inv.totales.montoNeto.toClpInteger(),
          montoExento: inv.totales.montoExento.toClpInteger(),
          tasaIva: inv.totales.tasaIva,
          montoIva: inv.totales.montoIva.toClpInteger(),
          montoTotal: inv.totales.montoTotal.toClpInteger(),
          currency: inv.totales.montoTotal.currency
        },
        estado: inv.estado,
        trackId: inv.trackId,
        glosaRechazo: inv.glosaRechazo
      })),
      total: result.total,
      page,
      limit,
      totalPages: totalPages === 0 ? 1 : totalPages
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
    let rawResponse: string | undefined;
    let statusQueryError: string | undefined;

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
        rawResponse = queryResult.rawResponse;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        statusQueryError = errorMsg;
        this.logger.warn(
          `Error al sincronizar estado SII para folio ${folio}: ${errorMsg}`
        );
      }
    }

    return {
      folio: invoice.folio!,
      tenantId,
      tipoDte: invoice.tipoDte.code,
      trackId: invoice.trackId,
      estado: invoice.estado,
      siiStatus,
      glosa: statusQueryError ? glosa : (glosa ?? invoice.glosaRechazo),
      rawResponse,
      statusQueryError
    };
  }

  @Get(':folio/xml')
  @ApiOperation({
    summary: 'Descargar XML oficial firmado del DTE',
    description:
      'Recupera el documento XML firmado (<DTE>) emitido y timbrado con TED, para intercambio con el receptor o respaldo tributario. ' +
      'No es el archivo de recepción del SII: para enviar al SII use GET /invoices/:folio/envio.'
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
    description: 'Contenido XML oficial del DTE firmado.',
    content: {
      'application/xml': {
        schema: {
          type: 'string',
          example: '<?xml version="1.0" encoding="ISO-8859-1"?><DTE>...</DTE>'
        }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description:
      'No se encontró la factura o no cuenta con XML firmado disponible.'
  })
  public async getInvoiceXml(
    @TenantId() tenantId: string,
    @Param('folio', ParseIntPipe) folio: number,
    @Query('tipoDte') tipoDteParam: string | undefined,
    @Res() res: Response
  ): Promise<void> {
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

    const xmlContent = invoice.signedDteXml;
    if (!xmlContent) {
      throw new NotFoundException(
        `La factura con folio ${folio} y tipo DTE ${tipoDteCode} no cuenta con XML firmado disponible`
      );
    }

    res.setHeader('Content-Type', 'application/xml; charset=iso-8859-1');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="dte-${tipoDteCode}-${folio}.xml"`
    );
    res.status(HttpStatus.OK).send(xmlContent);
  }

  @Get(':folio/envio')
  @ApiOperation({
    summary: 'Descargar el sobre EnvioDTE firmado',
    description:
      'Recupera el XML <EnvioDTE> (SetDTE, Carátula, DTE y firma del sobre) que la emisión transmite al SII. ' +
      'Este es el archivo que exige la recepción del SII: el DTE suelto no es un envío válido para ese trámite.'
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
    description: 'Contenido XML del sobre EnvioDTE firmado.',
    content: {
      'application/xml': {
        schema: {
          type: 'string',
          example:
            '<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE><SetDTE>...</SetDTE></EnvioDTE>'
        }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description:
      'No se encontró la factura o no cuenta con sobre EnvioDTE disponible.'
  })
  public async getInvoiceEnvioXml(
    @TenantId() tenantId: string,
    @Param('folio', ParseIntPipe) folio: number,
    @Query('tipoDte') tipoDteParam: string | undefined,
    @Res() res: Response
  ): Promise<void> {
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

    const xmlContent = invoice.envioDteXml;
    if (!xmlContent) {
      throw new NotFoundException(
        `La factura con folio ${folio} y tipo DTE ${tipoDteCode} no cuenta con sobre EnvioDTE disponible`
      );
    }

    res.setHeader('Content-Type', 'application/xml; charset=iso-8859-1');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="envio-${tipoDteCode}-${folio}.xml"`
    );
    res.status(HttpStatus.OK).send(xmlContent);
  }

  @Get(':folio/pdf')
  @ApiOperation({
    summary: 'Descargar representación gráfica oficial en PDF del DTE',
    description:
      'Genera el documento tributario electrónico en formato PDF conforme a las normas de diseño e impresión del SII Chile, ' +
      'incluyendo el timbre electrónico en código de barras bidimensional PDF417 de alta resolución (ECL 5, 3:1, quiet zone >= 0.25").'
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
    description: 'Documento PDF generado exitosamente.',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary'
        }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description:
      'No se encontró la factura o no cuenta con timbre electrónico disponible.'
  })
  public async getInvoicePdf(
    @TenantId() tenantId: string,
    @Param('folio', ParseIntPipe) folio: number,
    @Query('tipoDte') tipoDteParam: string | undefined,
    @Res() res: Response
  ): Promise<void> {
    const tipoDteCode = tipoDteParam ? parseInt(tipoDteParam, 10) : 33;

    try {
      const result = await this.generateDtePdfUseCase.execute({
        tenantId,
        folio,
        tipoDte: tipoDteCode
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`
      );
      res.setHeader('Content-Length', result.pdfBuffer.length.toString());
      res.status(HttpStatus.OK).send(result.pdfBuffer);
    } catch (err: unknown) {
      if (err instanceof FiscalValidationError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }
}
