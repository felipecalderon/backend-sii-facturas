import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IssuerResponseDto {
  @ApiProperty({
    description: 'Identificador único del tenant',
    example: 'tenant-acme-123'
  })
  tenantId!: string;

  @ApiProperty({
    description: 'RUT del emisor',
    example: '76192456-7'
  })
  rut!: string;

  @ApiProperty({
    description: 'Razón social del emisor',
    example: 'Servicios Informáticos y de Consultoría SpA'
  })
  razonSocial!: string;

  @ApiProperty({
    description: 'Giro o actividad del emisor',
    example: 'Servicios de Tecnología y Desarrollo de Software'
  })
  giro!: string;

  @ApiProperty({
    description: 'Código de actividad económica (Acteco)',
    example: 620100
  })
  actividadEconomica!: number;

  @ApiProperty({
    description: 'Dirección del emisor',
    example: 'Av. Providencia 1234, Oficina 501'
  })
  direccion!: string;

  @ApiProperty({
    description: 'Comuna del emisor',
    example: 'Providencia'
  })
  comuna!: string;

  @ApiPropertyOptional({
    description: 'Ciudad del emisor',
    example: 'Santiago'
  })
  ciudad?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico del emisor',
    example: 'facturacion@empresa.cl'
  })
  correo?: string;

  @ApiPropertyOptional({
    description: 'Teléfono del emisor',
    example: '+56912345678'
  })
  telefono?: string;

  @ApiPropertyOptional({
    description:
      'Fecha (AAAA-MM-DD) de la resolución de autorización de facturación electrónica del emisor',
    example: '22-08-2014'
  })
  fchResol?: string;

  @ApiPropertyOptional({
    description:
      'Número de la resolución de autorización de facturación electrónica del emisor',
    example: 80
  })
  nroResol?: number;
}
