import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  Max,
  Min
} from 'class-validator';
import { InvoiceStatus } from '../../../domain/dte/entities/invoice.entity.js';

export class QueryInvoicesDto {
  @ApiPropertyOptional({
    description: 'Número de página para la paginación (comienza en 1)',
    example: 1,
    default: 1,
    minimum: 1
  })
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página mínima es 1' })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de facturas a retornar por página (máximo 100)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100
  })
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite mínimo es 1' })
  @Max(100, { message: 'El límite máximo permitido es 100' })
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Filtrar por código de tipo de DTE (ej. 33 = Factura Electrónica, 61 = Nota de Crédito)',
    example: 33
  })
  @Type(() => Number)
  @IsInt({ message: 'El tipo de DTE debe ser un entero' })
  @IsOptional()
  tipoDte?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por estado del documento en el ciclo de vida fiscal',
    enum: InvoiceStatus,
    example: InvoiceStatus.ACCEPTED
  })
  @IsEnum(InvoiceStatus, {
    message: 'El estado debe ser un valor válido de InvoiceStatus'
  })
  @IsOptional()
  estado?: InvoiceStatus;

  @ApiPropertyOptional({
    description:
      'Fecha de emisión inicial para filtrar (formato ISO-8601 YYYY-MM-DD)',
    example: '2026-01-01'
  })
  @IsISO8601(
    {},
    { message: 'La fecha desde debe ser una cadena ISO-8601 válida' }
  )
  @IsOptional()
  desde?: string;

  @ApiPropertyOptional({
    description:
      'Fecha de emisión final para filtrar (formato ISO-8601 YYYY-MM-DD)',
    example: '2026-12-31'
  })
  @IsISO8601(
    {},
    { message: 'La fecha hasta debe ser una cadena ISO-8601 válida' }
  )
  @IsOptional()
  hasta?: string;
}
