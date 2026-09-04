import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { TedSigner } from './ted-signer.js';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';

describe('TedSigner', () => {
  // Generar un par de claves RSA real de 1024 bits para pruebas criptográficas
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });

  const createTestCaf = (): Caf =>
    Caf.create({
      tenantId: 'tenant-123',
      tipoDte: TipoDte.facturaElectronica(),
      rangoDesde: 1,
      rangoHasta: 100,
      clavePrivadaPem: privateKey,
      cafXml: '<CAF version="1.0"><DA><RE>76123456-0</RE></DA><FRMA>firma</FRMA></CAF>',
      fechaAutorizacion: new Date('2026-09-03'),
      rutEmisor: Rut.of('76123456-0'),
      activo: true,
    });

  const createTestInvoice = (): Invoice => {
    const inv = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor de Prueba SpA',
        giro: 'Servicios de TI',
        actividadEconomica: 620100,
        direccion: 'Calle Test 123',
        comuna: 'Santiago',
      }),
      receptor: Receiver.create({
        rut: Rut.of('6-K'),
        razonSocial: 'Empresa Receptora Con Un Nombre Sumamente Largo Que Debe Truncarse A 40 Caracteres',
        giro: 'Comercio',
        direccion: 'Av Test 456',
        comuna: 'Santiago',
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Ítem de prueba con nombre largo para verificar truncamiento',
          cantidad: Money.fromInteger(2),
          precioUnitario: Money.fromInteger(50000),
        }),
      ],
    });
    inv.assignFolio(42);
    return inv;
  };

  it('debe construir y firmar el TED con RSA-SHA1 y permitir su verificación criptográfica', () => {
    const invoice = createTestInvoice();
    const caf = createTestCaf();
    const timestamp = new Date('2026-09-03T12:00:00');

    const ted = TedSigner.generateAndSign(invoice, caf, timestamp);

    expect(ted.rawXml).toContain('<TED version="1.0">');
    expect(ted.rawXml).toContain('<FRMT algoritmo="SHA1withRSA">');
    expect(ted.tsted).toBe('2026-09-03T12:00:00');

    // Verificar que la firma es matemáticamente válida con la clave pública RSA
    const isValid = TedSigner.verify(ted.rawXml, publicKey);
    expect(isValid).toBe(true);
  });

  it('debe detectar alteraciones en el contenido del nodo <DD> como firma inválida', () => {
    const invoice = createTestInvoice();
    const caf = createTestCaf();

    const ted = TedSigner.generateAndSign(invoice, caf);

    // Alterar un dato en el XML del TED (e.g. monto)
    const tamperedXml = ted.rawXml.replace('<MNT>119000</MNT>', '<MNT>999999</MNT>');

    const isValid = TedSigner.verify(tamperedXml, publicKey);
    expect(isValid).toBe(false);
  });

  it('debe truncar RSR e IT1 a un máximo de 40 caracteres según especificación SII', () => {
    const invoice = createTestInvoice();
    const caf = createTestCaf();

    const ted = TedSigner.generateAndSign(invoice, caf);

    const rsrMatch = ted.ddXml.match(/<RSR>(.*?)<\/RSR>/);
    const it1Match = ted.ddXml.match(/<IT1>(.*?)<\/IT1>/);

    expect(rsrMatch).toBeDefined();
    expect(rsrMatch![1].length).toBeLessThanOrEqual(40);

    expect(it1Match).toBeDefined();
    expect(it1Match![1].length).toBeLessThanOrEqual(40);
  });
});
