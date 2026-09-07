import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '../../../domain/dte/entities/invoice.entity.js';

export class InvoiceTotalsResponseDto {
  @ApiProperty({
    description: 'Monto neto afecto a IVA en pesos enteros',
    example: 101250
  })
  montoNeto!: number;

  @ApiProperty({
    description: 'Monto exento de IVA en pesos enteros',
    example: 0
  })
  montoExento!: number;

  @ApiProperty({ description: 'Tasa de IVA aplicada', example: 19 })
  tasaIva!: number;

  @ApiProperty({
    description: 'Monto de IVA liquidado en pesos enteros',
    example: 19238
  })
  montoIva!: number;

  @ApiProperty({
    description: 'Monto total facturado en pesos enteros',
    example: 120488
  })
  montoTotal!: number;

  @ApiProperty({ description: 'Moneda de la operación', example: 'CLP' })
  currency!: string;
}

export class IssueInvoiceResponseDto {
  @ApiProperty({
    description: 'Folio fiscal correlativo asignado desde el CAF activo',
    example: 105
  })
  folio!: number;

  @ApiProperty({
    description:
      'Identificador único de recepción generado por el SII (Track ID)',
    example: '8765432190'
  })
  trackId!: string;

  @ApiProperty({
    description: 'Estado fiscal actual del documento emitido',
    enum: InvoiceStatus,
    example: InvoiceStatus.SUBMITTED
  })
  estado!: InvoiceStatus;

  @ApiProperty({
    description:
      'Indica si la solicitud fue resuelta por idempotencia sin consumir un nuevo folio ni generar duplicados',
    example: false
  })
  isDuplicate!: boolean;

  @ApiProperty({
    description: 'Resumen de totales liquidados del documento',
    type: () => InvoiceTotalsResponseDto
  })
  totales!: InvoiceTotalsResponseDto;
}
