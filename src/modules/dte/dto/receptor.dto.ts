import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReceptorDto {
  @ApiProperty({
    description: 'RUT del receptor o cliente adquirente (con guión)',
    example: '66666666-6'
  })
  @IsString({ message: 'El RUT del receptor debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El RUT del receptor es obligatorio' })
  rut!: string;

  @ApiProperty({
    description: 'Razón social o nombre completo del receptor',
    example: 'Empresa Cliente SpA'
  })
  @IsString({
    message: 'La razón social del receptor debe ser una cadena de texto'
  })
  @IsNotEmpty({ message: 'La razón social del receptor es obligatoria' })
  @MaxLength(100, {
    message: 'La razón social del receptor no puede exceder 100 caracteres'
  })
  razonSocial!: string;

  @ApiProperty({
    description: 'Giro o actividad del receptor',
    example: 'Servicios Comerciales'
  })
  @IsString({ message: 'El giro del receptor debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El giro del receptor es obligatorio' })
  @MaxLength(40, {
    message: 'El giro del receptor no puede exceder 40 caracteres'
  })
  giro!: string;

  @ApiProperty({
    description: 'Dirección del receptor',
    example: 'Av. Las Condes 9876'
  })
  @IsString({
    message: 'La dirección del receptor debe ser una cadena de texto'
  })
  @IsNotEmpty({ message: 'La dirección del receptor es obligatoria' })
  @MaxLength(60, {
    message: 'La dirección del receptor no puede exceder 60 caracteres'
  })
  direccion!: string;

  @ApiProperty({
    description: 'Comuna del receptor',
    example: 'Las Condes'
  })
  @IsString({ message: 'La comuna del receptor debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La comuna del receptor es obligatoria' })
  @MaxLength(20, {
    message: 'La comuna del receptor no puede exceder 20 caracteres'
  })
  comuna!: string;

  @ApiPropertyOptional({
    description: 'Ciudad del receptor',
    example: 'Santiago'
  })
  @IsOptional()
  @IsString({ message: 'La ciudad del receptor debe ser una cadena de texto' })
  ciudad?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico de intercambio DTE del receptor',
    example: 'dte@cliente.cl'
  })
  @IsOptional()
  @IsEmail(
    {},
    { message: 'El correo electrónico del receptor debe ser válido' }
  )
  correo?: string;

  @ApiPropertyOptional({
    description: 'Nombre de contacto o encargado de compras',
    example: 'Juan Pérez'
  })
  @IsOptional()
  @IsString({ message: 'El contacto debe ser una cadena de texto' })
  @MaxLength(80, {
    message: 'El contacto del receptor no puede exceder 80 caracteres'
  })
  contacto?: string;
}
