import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadCertificateDto {
  @ApiProperty({
    description: 'Contraseña del certificado digital (.p12 o .pfx)',
    example: 'ClaveSegura123!'
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña del certificado es obligatoria' })
  password!: string;

  @ApiPropertyOptional({
    description:
      'RUT del titular del certificado (opcional si se puede inferir del CN del certificado)',
    example: '12345678-5'
  })
  @IsOptional()
  @IsString({ message: 'El RUT del titular debe ser una cadena de texto' })
  rutTitular?: string;
}
