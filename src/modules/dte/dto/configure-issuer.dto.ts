import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfigureIssuerDto {
  @ApiProperty({
    description: 'RUT de la empresa o contribuyente emisor (formato con guión)',
    example: '76192456-7'
  })
  @IsString({ message: 'El RUT debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El RUT del emisor es obligatorio' })
  rut!: string;

  @ApiProperty({
    description: 'Razón social legal del emisor',
    example: 'Servicios Informáticos y de Consultoría SpA'
  })
  @IsString({ message: 'La razón social debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La razón social es obligatoria' })
  @MaxLength(100, {
    message: 'La razón social no puede exceder 100 caracteres'
  })
  razonSocial!: string;

  @ApiProperty({
    description: 'Giro o actividad del emisor según SII',
    example: 'Servicios de Tecnología y Desarrollo de Software'
  })
  @IsString({ message: 'El giro debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El giro es obligatorio' })
  @MaxLength(80, { message: 'El giro no puede exceder 80 caracteres' })
  giro!: string;

  @ApiProperty({
    description:
      'Código de actividad económica (Acteco) registrado en el SII (número entero positivo)',
    example: 620100
  })
  @Type(() => Number)
  @IsInt({
    message: 'El código de actividad económica debe ser un número entero'
  })
  @Min(1, { message: 'El código de actividad económica debe ser mayor a 0' })
  actividadEconomica!: number;

  @ApiProperty({
    description: 'Dirección matriz o sucursal del emisor',
    example: 'Av. Providencia 1234, Oficina 501'
  })
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La dirección es obligatoria' })
  @MaxLength(60, { message: 'La dirección no puede exceder 60 caracteres' })
  direccion!: string;

  @ApiProperty({
    description: 'Comuna de la dirección del emisor',
    example: 'Providencia'
  })
  @IsString({ message: 'La comuna debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La comuna es obligatoria' })
  @MaxLength(20, { message: 'La comuna no puede exceder 20 caracteres' })
  comuna!: string;

  @ApiPropertyOptional({
    description: 'Ciudad de la dirección del emisor',
    example: 'Santiago'
  })
  @IsOptional()
  @IsString({ message: 'La ciudad debe ser una cadena de texto' })
  @MaxLength(20, { message: 'La ciudad no puede exceder 20 caracteres' })
  ciudad?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico fiscal de contacto',
    example: 'facturacion@empresa.cl'
  })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico debe ser válido' })
  correo?: string;

  @ApiPropertyOptional({
    description: 'Teléfono de contacto',
    example: '+56912345678'
  })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  telefono?: string;

  @ApiPropertyOptional({
    description:
      'Fecha (AAAA-MM-DD) de la resolución de autorización de facturación electrónica del emisor según SII',
    example: '2024-12-30'
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fchResol debe tener formato AAAA-MM-DD'
  })
  fchResol?: string;

  @ApiPropertyOptional({
    description:
      'Número de la resolución de autorización de facturación electrónica del emisor según SII',
    example: 80
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'nroResol debe ser un número entero' })
  @Min(0, { message: 'nroResol no puede ser negativo' })
  @Max(999999, { message: 'nroResol no puede superar 6 dígitos' })
  nroResol?: number;
}
