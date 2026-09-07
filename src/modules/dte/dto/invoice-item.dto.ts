import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InvoiceItemDto {
  @ApiProperty({
    description: 'Número de línea correlativo dentro del detalle de la factura',
    example: 1
  })
  @Type(() => Number)
  @IsInt({ message: 'El número de línea debe ser un entero' })
  @Min(1, { message: 'El número de línea debe ser mayor o igual a 1' })
  linea!: number;

  @ApiProperty({
    description: 'Nombre o concepto del ítem facturado',
    example: 'Cajón AFECTO'
  })
  @IsString({ message: 'El nombre del ítem debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del ítem es obligatorio' })
  @MaxLength(80, {
    message: 'El nombre del ítem no puede exceder 80 caracteres'
  })
  nombre!: string;

  @ApiPropertyOptional({
    description: 'Descripción detallada adicional del ítem',
    example: 'Ejemplo'
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(1000, {
    message: 'La descripción no puede exceder 1000 caracteres'
  })
  descripcion?: string;

  @ApiProperty({
    description:
      'Cantidad de unidades del ítem (número positivo, admite decimales)',
    example: 169
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad debe ser un valor numérico' })
  @Min(0.000001, { message: 'La cantidad debe ser mayor a cero' })
  cantidad!: number;

  @ApiProperty({
    description: 'Precio unitario del ítem en moneda local (CLP)',
    example: 3523
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'El precio unitario debe ser un valor numérico' })
  @Min(0, { message: 'El precio unitario no puede ser negativo' })
  precioUnitario!: number;

  @ApiPropertyOptional({
    description: 'Indica si el ítem está exento de IVA (por defecto false)',
    example: false
  })
  @IsOptional()
  @IsBoolean({ message: 'esExento debe ser un valor booleano' })
  esExento?: boolean;

  @ApiPropertyOptional({
    description:
      'Porcentaje de descuento aplicable a la línea del ítem (entre 0 y 100)',
    example: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    {},
    { message: 'El porcentaje de descuento debe ser un valor numérico' }
  )
  @Min(0, { message: 'El porcentaje de descuento no puede ser menor a 0' })
  @Max(100, {
    message: 'El porcentaje de descuento no puede ser superior a 100'
  })
  descuentoPct?: number;

  @ApiPropertyOptional({
    description:
      'Monto fijo de descuento en moneda local (opcional si se especifica descuentoPct)',
    example: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El monto de descuento debe ser un valor numérico' })
  @Min(0, { message: 'El monto de descuento no puede ser negativo' })
  descuentoMonto?: number;
}

/*
{
      "linea": 1,
      "nombre": "Cajón AFECTO",
      "descripcion": "",
      "cantidad": 169,
      "precioUnitario": 3523,
      "esExento": false,
      "descuentoPct": 0,
      "descuentoMonto": 0
    },
{
      "linea": 2,
      "nombre": "Relleno AFECTO",
      "descripcion": "",
      "cantidad": 71,
      "precioUnitario": 5869,
      "esExento": false,
      "descuentoPct": 0,
      "descuentoMonto": 0
    }
      */
