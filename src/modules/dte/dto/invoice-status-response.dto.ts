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
    description:
      'Último estado fiscal persistido; statusQueryError indica que no pudo confirmarse en esta consulta',
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

  @ApiPropertyOptional({
    description:
      'Error de la consulta en línea al SII; si está presente, siiStatus y rawResponse no son actuales'
  })
  statusQueryError?: string;

  @ApiPropertyOptional({
    description:
      'Respuesta SOAP nativa recibida del SII al consultar el estado del envío',
    example: '<SOAP-ENV:Envelope>...</SOAP-ENV:Envelope>'
  })
  rawResponse?: string;
}
