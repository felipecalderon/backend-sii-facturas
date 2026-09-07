import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Model } from 'mongoose';
import { MongoIssuerRepository } from './mongo-issuer.repository.js';
import type { IssuerDocument } from './schemas/issuer.schema.js';
import { Issuer } from '../../../domain/dte/entities/issuer.entity.js';
import { Rut } from '../../../domain/shared/rut.vo.js';

describe('MongoIssuerRepository', () => {
  let repository: MongoIssuerRepository;
  let modelMock: {
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };

  const sampleIssuer = Issuer.create({
    rut: Rut.of('76.192.456-7'),
    razonSocial: 'Empresa Test SpA',
    giro: 'Servicios de TI',
    actividadEconomica: 620100,
    direccion: 'Av. Providencia 1234',
    comuna: 'Providencia'
  });

  beforeEach(() => {
    modelMock = {
      findOneAndUpdate: vi.fn().mockResolvedValue({}),
      findOne: vi.fn()
    };

    repository = new MongoIssuerRepository(
      modelMock as unknown as Model<IssuerDocument>
    );
  });

  describe('save', () => {
    it('debe ejecutar findOneAndUpdate con upsert para guardar el emisor', async () => {
      await repository.save('tenant-abc', sampleIssuer);

      expect(modelMock.findOneAndUpdate).toHaveBeenCalledWith(
        { tenantId: 'tenant-abc' },
        expect.objectContaining({
          tenantId: 'tenant-abc',
          rut: '76192456-7',
          razonSocial: 'Empresa Test SpA'
        }),
        { upsert: true, returnDocument: 'after' }
      );
    });
  });

  describe('findByTenantId', () => {
    it('debe retornar null si no existe el emisor', async () => {
      modelMock.findOne.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(null)
        })
      });

      const result = await repository.findByTenantId('tenant-inexistente');
      expect(result).toBeNull();
    });

    it('debe reconstituir la entidad Issuer si existe en base de datos', async () => {
      modelMock.findOne.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({
            tenantId: 'tenant-abc',
            rut: '76192456-7',
            razonSocial: 'Empresa Test SpA',
            giro: 'Servicios de TI',
            actividadEconomica: 620100,
            direccion: 'Av. Providencia 1234',
            comuna: 'Providencia',
            ciudad: 'Santiago',
            correo: 'contacto@test.cl',
            telefono: '+56900000000'
          })
        })
      });

      const result = await repository.findByTenantId('tenant-abc');
      expect(result).not.toBeNull();
      expect(result!.rut.toCanonical()).toBe('76192456-7');
      expect(result!.razonSocial).toBe('Empresa Test SpA');
      expect(result!.actividadEconomica).toBe(620100);
    });
  });
});
