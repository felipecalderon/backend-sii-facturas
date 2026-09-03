import { describe, it, expect } from 'vitest';
import { Caf } from './caf.entity.js';
import { TipoDte } from '../../dte/values/dte-type.vo.js';
import { Rut } from '../../shared/rut.vo.js';
import {
  FoliosExhaustedError,
  InvalidCafXmlError
} from '../errors/folio-domain.error.js';

describe('Caf Entity', () => {
  const createTestCaf = (desde = 1, hasta = 3, ultimo = 0): Caf =>
    Caf.create({
      tenantId: 'tenant-test',
      tipoDte: TipoDte.facturaElectronica(),
      rangoDesde: desde,
      rangoHasta: hasta,
      ultimoFolioAsignado: ultimo,
      clavePrivadaPem:
        '-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----',
      cafXml: '<CAF><DA></DA></CAF>',
      fechaAutorizacion: new Date('2026-09-03'),
      rutEmisor: Rut.of('76123456-0'),
      activo: true
    });

  it('debe crear una entidad CAF y calcular la disponibilidad inicial', () => {
    const caf = createTestCaf(100, 200, 99);
    expect(caf.hasAvailableFolios()).toBe(true);
    expect(caf.getAvailableCount()).toBe(101);
    expect(caf.getNextAvailableFolio()).toBe(100);
  });

  it('debe asignar folios correlativos hasta su agotamiento', () => {
    const caf = createTestCaf(1, 2, 0);

    const f1 = caf.allocateNextFolio();
    expect(f1).toBe(1);
    expect(caf.ultimoFolioAsignado).toBe(1);
    expect(caf.hasAvailableFolios()).toBe(true);

    const f2 = caf.allocateNextFolio();
    expect(f2).toBe(2);
    expect(caf.ultimoFolioAsignado).toBe(2);
    expect(caf.hasAvailableFolios()).toBe(false);

    expect(() => caf.allocateNextFolio()).toThrow(FoliosExhaustedError);
  });

  it('debe rechazar rangos inválidos', () => {
    expect(() =>
      Caf.create({
        tenantId: 'tenant-test',
        tipoDte: TipoDte.facturaElectronica(),
        rangoDesde: 100,
        rangoHasta: 50, // desde > hasta
        clavePrivadaPem:
          '-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----',
        cafXml: '<CAF></CAF>',
        fechaAutorizacion: new Date(),
        rutEmisor: Rut.of('76123456-0')
      })
    ).toThrow(InvalidCafXmlError);
  });
});
