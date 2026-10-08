import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { DteXmlRenderer } from './dte-xml-renderer.js';
import { XsdValidator } from './xsd-validator.js';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { TedSigner } from '../crypto/ted-signer.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

describe('DteXmlRenderer', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });

  const createStampedInvoice = (
    firstItemName = 'Servidor Rack 1U Xeon'
  ): Invoice => {
    const inv = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Sociedad Comercial Emisora SpA',
        giro: 'Venta de Equipos Informaticos',
        actividadEconomica: 620100,
        direccion: 'Av Libertador Bernardo OHiggins 1234',
        comuna: 'Santiago',
        ciudad: 'Santiago'
      }),
      receptor: Receiver.create({
        rut: Rut.of('6-K'),
        razonSocial: 'Cliente Comprador Limitada',
        giro: 'Servicios Profesionales',
        direccion: 'Calle Los Conquistadores 567',
        comuna: 'Providencia',
        ciudad: 'Santiago'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: firstItemName,
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(500000)
        }),
        InvoiceItem.create({
          linea: 2,
          nombre: 'Memoria RAM 32GB DDR4',
          cantidad: Money.fromInteger(2),
          precioUnitario: Money.fromInteger(50000)
        })
      ]
    });

    inv.assignFolio(101);

    const caf = Caf.create({
      tenantId: 'tenant-123',
      tipoDte: TipoDte.facturaElectronica(),
      rangoDesde: 1,
      rangoHasta: 500,
      clavePrivadaPem: privateKey,
      cafXml:
        '<CAF version="1.0"><DA><RE>76123456-0</RE><RS>RUT DE PRUEBA</RS><TD>33</TD><RNG><D>1</D><H>500</H></RNG><FA>2026-09-03</FA><RSAPK><M>0a4O</M><E>Aw==</E></RSAPK><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">g1AQX0sy8NJugX52k2hTJEZAE9Cuul6pqYBdFxj1N17umW7zG/hAavCALKByHzdYAfZ3LhGTXCai5zNxOo4lDQ==</FRMA></CAF>',
      fechaAutorizacion: new Date('2026-09-03'),
      rutEmisor: Rut.of('76123456-0'),
      activo: true
    });

    const ted = TedSigner.generateAndSign(
      inv,
      caf,
      new Date('2026-09-03T10:00:00')
    );
    inv.stampTed(ted.rawXml);

    return inv;
  };

  it('debe serializar el XML completo del DTE cumpliendo la estructura canónica y los namespaces oficiales', () => {
    const invoice = createStampedInvoice();
    const xml = DteXmlRenderer.render(invoice);

    expect(xml).toContain('<?xml version="1.0" encoding="ISO-8859-1"?>');
    expect(xml).toMatch(/<DTE\b[^>]*\bxmlns="http:\/\/www\.sii\.cl\/SiiDte"/);
    expect(xml).toMatch(
      /<DTE\b[^>]*\bxmlns:xsi="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance"/
    );
    expect(xml).toContain('<Documento ID="F101T33">');
    expect(xml).toContain('<TipoDTE>33</TipoDTE>');
    expect(xml).toContain('<Folio>101</Folio>');
    expect(xml).toContain('<RUTEmisor>76123456-0</RUTEmisor>');
    expect(xml).toContain('<RUTRecep>6-K</RUTRecep>');
    expect(xml).toContain('<MntNeto>600000</MntNeto>');
    expect(xml).toContain('<IVA>114000</IVA>');
    expect(xml).toContain('<MntTotal>714000</MntTotal>');
    expect(xml).toContain('<TED version="1.0">');
    expect(xml).toContain('<TmstFirma>');
    expect(xml).toContain(
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">'
    );
  });

  it('debe conservar tildes Latin-1 y rechazar caracteres no representables antes de firmar', () => {
    const xmlWithAccent = DteXmlRenderer.render(
      createStampedInvoice('Servidor Purén')
    );
    expect(xmlWithAccent).toContain('Servidor Purén');

    expect(() =>
      DteXmlRenderer.render(createStampedInvoice('Producto 😀'))
    ).toThrow(FiscalValidationError);
  });

  it('debe validar exitosamente el XML generado contra el esquema oficial DTE_v10.xsd', async () => {
    const invoice = createStampedInvoice();
    const xml = DteXmlRenderer.render(invoice);

    const validation = await XsdValidator.validateDte(xml);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});
