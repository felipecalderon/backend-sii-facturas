import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '../../../domain/dte/entities/invoice.entity.js';

export class InvoiceStatusResponseDto {
  @ApiProperty({
    description: 'Folio asignado al documento',
    example: 105
  })
  folio!: number;

  @ApiProperty({
    description: 'Identificador del tenant emisor',
    example: 'tenant-acme-123'
  })
  tenantId!: string;

  @ApiProperty({
    description: 'Código del tipo de DTE (33 = Factura Electrónica)',
    example: 33
  })
  tipoDte!: number;

  @ApiPropertyOptional({
    description: 'Track ID de recepción del SII',
    example: '8765432190'
  })
  trackId?: string;

  @ApiProperty({
    description: 'Estado fiscal actual registrado en el sistema',
    enum: InvoiceStatus,
    example: InvoiceStatus.ACCEPTED
  })
  estado!: InvoiceStatus;

  @ApiPropertyOptional({
    description:
      'Código de estado retornado por la consulta en línea al SII (EPR, REC, RECH, UNKNOWN)',
    example: 'EPR'
  })
  siiStatus?: string;

  @ApiPropertyOptional({
    description:
      'Glosa descriptiva devuelta por el SII o motivo de observación/rechazo',
    example: 'Envio Recibido Conforme'
  })
  glosa?: string;
}
