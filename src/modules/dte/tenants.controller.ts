import {
  Controller,
  Put,
  Get,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
  NotFoundException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  ISSUER_REPOSITORY_TOKEN,
  type IssuerRepository
} from '../../domain/dte/ports/issuer.repository.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { TenantId } from '../../infrastructure/http/decorators/tenant-id.decorator.js';
import { ConfigureIssuerDto } from './dto/configure-issuer.dto.js';
import { IssuerResponseDto } from './dto/issuer-response.dto.js';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    @Inject(ISSUER_REPOSITORY_TOKEN)
    private readonly issuerRepository: IssuerRepository
  ) {}

  @Put('issuer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Registrar o actualizar la información fiscal del contribuyente emisor',
    description:
      'Configura la empresa emisora para el tenant (RUT, razón social, giro, actividad económica, dirección y comuna). ' +
      'Esta información será reutilizada automáticamente en todas las emisiones de DTE del tenant.'
  })
  @ApiResponse({
    status: 200,
    description: 'Emisor configurado exitosamente.',
    type: IssuerResponseDto
  })
  @ApiResponse({
    status: 400,
    description:
      'Datos del emisor malformados o inválidos según reglas fiscales.'
  })
  public async configureIssuer(
    @TenantId() tenantId: string,
    @Body() dto: ConfigureIssuerDto
  ): Promise<IssuerResponseDto> {
    const issuer = Issuer.create({
      rut: Rut.of(dto.rut),
      razonSocial: dto.razonSocial,
      giro: dto.giro,
      actividadEconomica: dto.actividadEconomica,
      direccion: dto.direccion,
      comuna: dto.comuna,
      ciudad: dto.ciudad,
      correo: dto.correo,
      telefono: dto.telefono
    });

    await this.issuerRepository.save(tenantId, issuer);

    return {
      tenantId,
      rut: issuer.rut.toCanonical(),
      razonSocial: issuer.razonSocial,
      giro: issuer.giro,
      actividadEconomica: issuer.actividadEconomica,
      direccion: issuer.direccion,
      comuna: issuer.comuna,
      ciudad: issuer.ciudad,
      correo: issuer.correo,
      telefono: issuer.telefono
    };
  }

  @Get('issuer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consultar la configuración fiscal del emisor del tenant',
    description:
      'Retorna los datos de la empresa emisora configurada previamente para el tenant.'
  })
  @ApiResponse({
    status: 200,
    description: 'Datos del emisor obtenidos exitosamente.',
    type: IssuerResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'El tenant no tiene configurado un emisor fiscal.'
  })
  public async getIssuer(
    @TenantId() tenantId: string
  ): Promise<IssuerResponseDto> {
    const issuer = await this.issuerRepository.findByTenantId(tenantId);

    if (!issuer) {
      throw new NotFoundException(
        `No existe configuración fiscal de emisor para el tenant '${tenantId}'`
      );
    }

    return {
      tenantId,
      rut: issuer.rut.toCanonical(),
      razonSocial: issuer.razonSocial,
      giro: issuer.giro,
      actividadEconomica: issuer.actividadEconomica,
      direccion: issuer.direccion,
      comuna: issuer.comuna,
      ciudad: issuer.ciudad,
      correo: issuer.correo,
      telefono: issuer.telefono
    };
  }
}
