import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '../../../domain/dte/entities/invoice.entity.js';
import { InvoiceTotalsResponseDto } from './issue-invoice-response.dto.js';

export class InvoiceReceiverSummaryDto {
  @ApiProperty({
    description: 'RUT canónico del receptor',
    example: '55666777-2'
  })
  rut!: string;

  @ApiProperty({
    description: 'Razón social del receptor',
    example: 'Distribuidora del Sur SpA'
  })
  razonSocial!: string;
}

export class InvoiceSummaryResponseDto {
  @ApiProperty({
    description: 'Folio asignado al documento',
    example: 105
  })
  folio!: number;

  @ApiProperty({
    description:
      'Código del tipo de DTE (33 = Factura Electrónica, 61 = Nota de Crédito)',
    example: 33
  })
  tipoDte!: number;

  @ApiProperty({
    description: 'Fecha de emisión contable del documento',
    example: '2026-09-25T00:00:00.000Z'
  })
  fechaEmision!: Date;

  @ApiProperty({
    description: 'Datos resumidos del receptor tributario',
    type: InvoiceReceiverSummaryDto
  })
  receptor!: InvoiceReceiverSummaryDto;

  @ApiProperty({
    description: 'Totales calculados del documento',
    type: InvoiceTotalsResponseDto
  })
  totales!: InvoiceTotalsResponseDto;

  @ApiProperty({
    description: 'Estado fiscal actual del documento',
    enum: InvoiceStatus,
    example: InvoiceStatus.ACCEPTED
  })
  estado!: InvoiceStatus;

  @ApiPropertyOptional({
    description: 'Track ID de recepción del SII',
    example: '8765432190'
  })
  trackId?: string;

  @ApiPropertyOptional({
    description: 'Glosa o motivo de rechazo fiscal si aplica',
    example: 'Envio Recibido Conforme'
  })
  glosaRechazo?: string;
}

export class PaginatedInvoicesResponseDto {
  @ApiProperty({
    description: 'Listado de facturas correspondientes a la página consultada',
    type: [InvoiceSummaryResponseDto]
  })
  items!: InvoiceSummaryResponseDto[];

  @ApiProperty({
    description:
      'Total de documentos encontrados con los filtros especificados',
    example: 142
  })
  total!: number;

  @ApiProperty({
    description: 'Número de página actual',
    example: 1
  })
  page!: number;

  @ApiProperty({
    description: 'Cantidad máxima de elementos por página',
    example: 20
  })
  limit!: number;

  @ApiProperty({
    description: 'Cantidad total de páginas disponibles',
    example: 8
  })
  totalPages!: number;
}
