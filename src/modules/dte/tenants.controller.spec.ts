import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TenantsController } from './tenants.controller.js';
import { IssuerRepository } from '../../domain/dte/ports/issuer.repository.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';

describe('TenantsController', () => {
  let controller: TenantsController;
  let issuerRepositoryMock: Partial<IssuerRepository>;

  beforeEach(() => {
    issuerRepositoryMock = {
      save: vi.fn().mockResolvedValue(undefined),
      findByTenantId: vi.fn()
    };

    controller = new TenantsController(
      issuerRepositoryMock as IssuerRepository
    );
  });

  describe('configureIssuer (PUT /tenants/issuer)', () => {
    it('debe registrar y guardar exitosamente el emisor fiscal para el tenant', async () => {
      const dto = {
        rut: '76192456-7',
        razonSocial: 'Empresa Demo SpA',
        giro: 'Servicios de TI',
        actividadEconomica: 620100,
        direccion: 'Av. Providencia 1234',
        comuna: 'Providencia',
        ciudad: 'Santiago',
        correo: 'facturacion@demo.cl',
        telefono: '+56911223344',
        fchResol: '2026-09-01',
        nroResol: 80
      };

      const result = await controller.configureIssuer('tenant-1', dto);

      expect(issuerRepositoryMock.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        tenantId: 'tenant-1',
        rut: '76192456-7',
        razonSocial: 'Empresa Demo SpA',
        giro: 'Servicios de TI',
        actividadEconomica: 620100,
        direccion: 'Av. Providencia 1234',
        comuna: 'Providencia',
        ciudad: 'Santiago',
        correo: 'facturacion@demo.cl',
        telefono: '+56911223344',
        fchResol: '2026-09-01',
        nroResol: 80
      });
    });
  });

  describe('getIssuer (GET /tenants/issuer)', () => {
    it('debe retornar la configuración fiscal del emisor si existe', async () => {
      const issuer = Issuer.create({
        rut: Rut.of('76192456-7'),
        razonSocial: 'Empresa Demo SpA',
        giro: 'Servicios de TI',
        actividadEconomica: 620100,
        direccion: 'Av. Providencia 1234',
        comuna: 'Providencia',
        fchResol: '2026-09-01',
        nroResol: 80
      });

      vi.mocked(issuerRepositoryMock.findByTenantId!).mockResolvedValue(issuer);

      const result = await controller.getIssuer('tenant-1');

      expect(issuerRepositoryMock.findByTenantId).toHaveBeenCalledWith(
        'tenant-1'
      );
      expect(result.rut).toBe('76192456-7');
      expect(result.razonSocial).toBe('Empresa Demo SpA');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.fchResol).toBe('2026-09-01');
      expect(result.nroResol).toBe(80);
    });

    it('debe lanzar NotFoundException si el tenant no tiene emisor configurado', async () => {
      vi.mocked(issuerRepositoryMock.findByTenantId!).mockResolvedValue(null);

      await expect(controller.getIssuer('tenant-inexistente')).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
