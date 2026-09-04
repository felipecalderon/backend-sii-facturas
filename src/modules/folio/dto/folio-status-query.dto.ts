import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FolioStatusQueryDto {
  @ApiProperty({
    description:
      'Código numérico del tipo de DTE (ej: 33 = Factura Electrónica, 34 = Factura Exenta)',
    example: 33
  })
  @Type(() => Number)
  @IsInt({ message: 'tipoDte debe ser un número entero' })
  @Min(1, { message: 'tipoDte debe ser mayor a 0' })
  tipoDte!: number;
}
