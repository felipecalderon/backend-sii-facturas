import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { EnvioDteBuilder } from './envio-dte-builder.js';
import { DteSigner } from '../crypto/dte-signer.js';
import { DigitalCertificate } from '../../domain/certificate/values/digital-certificate.vo.js';
import { createEphemeralCertificate } from '../crypto/test-cert-helper.js';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { TedSigner } from '../crypto/ted-signer.js';
import { DteXmlRenderer } from './dte-xml-renderer.js';
import { XsdValidator } from './xsd-validator.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

describe('EnvioDteBuilder', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });

  const getSignedDte = (
    folio = 101
  ): { signedDteXml: string; cert: DigitalCertificate; docId: string } => {
    const inv = Invoice.createDraft({
      tenantId: 'tenant-envio',
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor SpA',
        giro: 'Servicios de TI',
        actividadEconomica: 620100,
        direccion: 'Calle Central 123',
        comuna: 'Santiago'
      }),
      receptor: Receiver.create({
        rut: Rut.of('6-K'),
        razonSocial: 'Receptor SA',
        giro: 'Comercio',
        direccion: 'Calle Test 456',
        comuna: 'Santiago'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Consultoría Tecnológica',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(25000)
        })
      ]
    });

    inv.assignFolio(folio);

    const caf = Caf.create({
      tenantId: 'tenant-envio',
      tipoDte: TipoDte.facturaElectronica(),
      rangoDesde: 1,
      rangoHasta: 500,
      clavePrivadaPem: privateKey,
      cafXml:
        '<CAF version="1.0"><DA><RE>76123456-0</RE><RS>RUT</RS><TD>33</TD><RNG><D>1</D><H>500</H></RNG><FA>2026-09-03</FA><RSAPK><M>0a4O</M><E>Aw==</E></RSAPK><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">g1AQX0sy8NJugX52k2hTJEZAE9Cuul6pqYBdFxj1N17umW7zG/hAavCALKByHzdYAfZ3LhGTXCai5zNxOo4lDQ==</FRMA></CAF>',
      fechaAutorizacion: new Date('2026-09-03'),
      rutEmisor: Rut.of('76123456-0'),
      activo: true
    });

    const ted = TedSigner.generateAndSign(inv, caf);
    inv.stampTed(ted.rawXml);

    const dteXml = DteXmlRenderer.render(inv);
    inv.setDteXml(dteXml);

    const ephem = createEphemeralCertificate('pass123', '15123456-9');
    const cert = DigitalCertificate.create({
      rutTitular: Rut.of(ephem.rutTitular),
      privateKeyPem: ephem.privateKeyPem,
      certificatePem: ephem.certificatePem,
      validFrom: new Date(Date.now() - 1000 * 60 * 60),
      validTo: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
    });

    const docId = `F${inv.folio}T${inv.tipoDte.code}`;
    const signedDteXml = DteSigner.sign(dteXml, cert, docId);
    inv.sign(signedDteXml);

    return { signedDteXml, cert, docId };
  };

  it('debe construir el sobre EnvioDTE con Carátula, SetDTE y firma XMLDSig válida', () => {
    const { signedDteXml, cert, docId } = getSignedDte(101);
    const signedDteWithWhitespace = signedDteXml.replace(
      '</DTE>',
      '\n  </DTE>'
    );

    const envioXml = EnvioDteBuilder.buildAndSign(
      [signedDteWithWhitespace],
      cert,
      {
        rutEmisor: Rut.of('76123456-0'),
        rutEnvia: Rut.of('15123456-9'),
        rutReceptor: Rut.of('60803000-K'),
        fchResol: '2026-09-01',
        nroResol: 80
      }
    );

    expect(envioXml).toBeDefined();
    expect(envioXml).toContain('<?xml version="1.0" encoding="ISO-8859-1"?>');
    expect(envioXml).toContain('<EnvioDTE');
    expect(envioXml).toContain('<SetDTE ID="SetDoc">');
    expect(envioXml).toContain('<DTE version="1.0">');
    expect(envioXml).not.toMatch(/<DTE\b[^>]*\bxmlns/);
    expect(envioXml).toContain('\n  </DTE>');
    expect(envioXml).toContain('<Caratula version="1.0">');
    expect(envioXml).toContain('<RutEmisor>76123456-0</RutEmisor>');
    expect(envioXml).toContain('<RutEnvia>15123456-9</RutEnvia>');
    expect(envioXml).toContain('<RutReceptor>60803000-K</RutReceptor>');
    expect(envioXml).toContain('<FchResol>2026-09-01</FchResol>');
    expect(envioXml).toContain('<NroResol>80</NroResol>');
    expect(envioXml).toContain('<TpoDTE>33</TpoDTE>');
    expect(envioXml).toContain('<NroDTE>1</NroDTE>');
    expect(envioXml).toContain('<Reference URI="#SetDoc">');
    expect(envioXml).toMatch(/<KeyValue>\s*<RSAKeyValue>/);
    expect(envioXml).toMatch(/<X509Data>\s*<X509Certificate>/);

    // Verificar firma criptográfica de EnvioDTE sobre el SetDTE (#SetDoc)
    const isValid = EnvioDteBuilder.verify(envioXml);
    expect(isValid).toBe(true);
    expect(DteSigner.verify(envioXml, docId)).toBe(true);

    // Alterar el contenido dentro de SetDTE debe invalidar la firma del sobre
    const tamperedXml = envioXml.replace(
      'Consultoría Tecnológica',
      'Consultoría Modificada'
    );
    expect(EnvioDteBuilder.verify(tamperedXml)).toBe(false);
  });

  it('debe verificar cada firma DTE anidada en un sobre con varios documentos', () => {
    const first = getSignedDte(201);
    const second = getSignedDte(202);
    const envioXml = EnvioDteBuilder.buildAndSign(
      [first.signedDteXml, second.signedDteXml],
      first.cert,
      {
        rutEmisor: Rut.of('76123456-0'),
        rutEnvia: Rut.of('15123456-9'),
        fchResol: '2026-09-01',
        nroResol: 80
      }
    );

    expect(DteSigner.verify(envioXml, first.docId)).toBe(true);
    expect(DteSigner.verify(envioXml, second.docId)).toBe(true);
    expect(EnvioDteBuilder.verify(envioXml)).toBe(true);
  });

  it('debe generar un sobre que valida contra el esquema EnvioDTE_v10.xsd', async () => {
    const { signedDteXml, cert } = getSignedDte(104);

    const envioXml = EnvioDteBuilder.buildAndSign([signedDteXml], cert, {
      rutEmisor: Rut.of('76123456-0'),
      rutEnvia: Rut.of('15123456-9'),
      rutReceptor: Rut.of('60803000-K'),
      fchResol: '2026-09-01',
      nroResol: 0
    });

    const validation = await XsdValidator.validateEnvioDte(envioXml);
    expect(validation.errors).toEqual([]);
    expect(validation.isValid).toBe(true);
  });

  it('debe rechazar la construcción si no se entregan DTEs', () => {
    const { cert } = getSignedDte(102);

    expect(() =>
      EnvioDteBuilder.buildAndSign([], cert, {
        rutEmisor: Rut.of('76123456-0'),
        rutEnvia: Rut.of('15123456-9'),
        fchResol: '2026-09-01',
        nroResol: 80
      })
    ).toThrow(FiscalValidationError);
  });

  it('debe rechazar la construcción si faltan fchResol y nroResol en la carátula', () => {
    const { signedDteXml, cert } = getSignedDte(103);

    expect(() =>
      EnvioDteBuilder.buildAndSign([signedDteXml], cert, {
        rutEmisor: Rut.of('76123456-0'),
        rutEnvia: Rut.of('15123456-9')
      } as any)
    ).toThrow(FiscalValidationError);
  });
});
