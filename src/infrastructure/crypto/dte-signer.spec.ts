import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { DteSigner } from './dte-signer.js';
import { DigitalCertificate } from '../../domain/certificate/values/digital-certificate.vo.js';
import { createEphemeralCertificate } from './test-cert-helper.js';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { TedSigner } from './ted-signer.js';
import { DteXmlRenderer } from '../xml/dte-xml-renderer.js';
import { XsdValidator } from '../xml/xsd-validator.js';

describe('DteSigner', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });

  const getSampleBuiltInvoice = (): {
    invoice: Invoice;
    docId: string;
    dteXml: string;
  } => {
    const inv = Invoice.createDraft({
      tenantId: 'tenant-dte-signer',
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor SpA',
        giro: 'Servicios de Computacion',
        actividadEconomica: 620100,
        direccion: 'Avenida Providencia 1234',
        comuna: 'Providencia'
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
          nombre: 'Servicio Cloud',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(50000)
        })
      ]
    });

    inv.assignFolio(77);

    const caf = Caf.create({
      tenantId: 'tenant-dte-signer',
      tipoDte: TipoDte.facturaElectronica(),
      rangoDesde: 1,
      rangoHasta: 100,
      clavePrivadaPem: privateKey,
      cafXml:
        '<CAF version="1.0"><DA><RE>76123456-0</RE><RS>RUT</RS><TD>33</TD><RNG><D>1</D><H>100</H></RNG><FA>2026-09-03</FA><RSAPK><M>0a4O</M><E>Aw==</E></RSAPK><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">g1AQX0sy8NJugX52k2hTJEZAE9Cuul6pqYBdFxj1N17umW7zG/hAavCALKByHzdYAfZ3LhGTXCai5zNxOo4lDQ==</FRMA></CAF>',
      fechaAutorizacion: new Date('2026-09-03'),
      rutEmisor: Rut.of('76123456-0'),
      activo: true
    });

    const ted = TedSigner.generateAndSign(inv, caf);
    inv.stampTed(ted.rawXml);

    const docId = `F${inv.folio}T${inv.tipoDte.code}`;
    const dteXml = DteXmlRenderer.render(inv);
    inv.setDteXml(dteXml);

    return { invoice: inv, docId, dteXml };
  };

  it('debe firmar el DTE con XMLDSig RSA-SHA1 e incluir KeyValue y X509Data válidos', async () => {
    const { docId, dteXml } = getSampleBuiltInvoice();
    const ephem = createEphemeralCertificate('test-pass', '76123456-0');

    const cert = DigitalCertificate.create({
      rutTitular: Rut.of(ephem.rutTitular),
      privateKeyPem: ephem.privateKeyPem,
      certificatePem: ephem.certificatePem,
      validFrom: new Date(Date.now() - 1000 * 60 * 60),
      validTo: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
    });

    const signedXml = DteSigner.sign(dteXml, cert, docId);

    expect(signedXml).toBeDefined();
    expect(signedXml).toContain('<?xml version="1.0" encoding="ISO-8859-1"?>');
    expect(signedXml).toContain(
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">'
    );
    expect(signedXml).toContain(`<Reference URI="#${docId}">`);
    expect(signedXml).toMatch(/<KeyValue>\s*<RSAKeyValue>\s*<Modulus>/);
    expect(signedXml).toMatch(/<X509Data>\s*<X509Certificate>/);

    const isValidSig = DteSigner.verify(signedXml);
    expect(isValidSig).toBe(true);

    // Validación formal contra el esquema oficial DTE_v10.xsd
    const xsdResult = await XsdValidator.validateDte(signedXml);
    expect(xsdResult.isValid).toBe(true);
  });

  it('debe invalidar la firma si se altera el contenido de Documento', () => {
    const { docId, dteXml } = getSampleBuiltInvoice();
    const ephem = createEphemeralCertificate('test-pass', '76123456-0');

    const cert = DigitalCertificate.create({
      rutTitular: Rut.of(ephem.rutTitular),
      privateKeyPem: ephem.privateKeyPem,
      certificatePem: ephem.certificatePem,
      validFrom: new Date(Date.now() - 1000 * 60 * 60),
      validTo: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
    });

    const signedXml = DteSigner.sign(dteXml, cert, docId);

    // Alterar algún texto dentro de Documento
    const tamperedXml = signedXml.replace(
      'Servicio Cloud',
      'Servicio Modificado Ilegalmente'
    );

    const isValid = DteSigner.verify(tamperedXml);
    expect(isValid).toBe(false);
  });
});
