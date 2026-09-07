import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReceptorDto } from './receptor.dto.js';
import { InvoiceItemDto } from './invoice-item.dto.js';
import type { SiiEnvironment } from '../../../domain/sii/values/sii-domain.types.js';

export class IssueInvoiceDto {
  @ApiPropertyOptional({
    description:
      'Fecha contable de emisión de la factura en formato ISO-8601 (por defecto fecha actual)',
    example: '2026-09-07T12:00:00.000Z'
  })
  @IsOptional()
  @IsISO8601({}, { message: 'fechaEmision debe tener formato ISO-8601 válido' })
  fechaEmision?: string;

  @ApiProperty({
    description: 'Información fiscal del cliente receptor del DTE',
    type: () => ReceptorDto
  })
  @ValidateNested()
  @Type(() => ReceptorDto)
  receptor!: ReceptorDto;

  @ApiProperty({
    description: 'Detalle de líneas de ítems facturados (mínimo 1 ítem)',
    type: () => [InvoiceItemDto]
  })
  @IsArray({ message: 'items debe ser un arreglo de ítems' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un ítem en la factura' })
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];

  @ApiPropertyOptional({
    description:
      'Tasa del Impuesto al Valor Agregado en porcentaje (por defecto 19%)',
    example: 19
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'tasaIva debe ser un valor numérico' })
  @Min(0, { message: 'tasaIva no puede ser negativa' })
  @Max(100, { message: 'tasaIva no puede ser mayor a 100' })
  tasaIva?: number;

  @ApiPropertyOptional({
    description: 'Entorno de destino del SII (CERTIFICATION o PRODUCTION)',
    enum: ['CERTIFICATION', 'PRODUCTION'],
    example: 'CERTIFICATION'
  })
  @IsOptional()
  @IsIn(['CERTIFICATION', 'PRODUCTION'], {
    message: 'environment debe ser CERTIFICATION o PRODUCTION'
  })
  environment?: SiiEnvironment;

  @ApiPropertyOptional({
    description:
      'Indica si se valida estrictamente el XML DTE contra los esquemas XSD oficiales del SII (por defecto true)',
    example: true
  })
  @IsOptional()
  @IsBoolean({ message: 'validateXsd debe ser un booleano' })
  validateXsd?: boolean;
}
