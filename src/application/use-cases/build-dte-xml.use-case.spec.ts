import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { BuildDteXmlUseCase } from './build-dte-xml.use-case.js';
import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { TedSigner } from '../../infrastructure/crypto/ted-signer.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

describe('BuildDteXmlUseCase', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });

  const createStampedInvoice = (tenantId = 'tenant-123'): Invoice => {
    const inv = Invoice.createDraft({
      tenantId,
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor SpA',
        giro: 'Servicios',
        actividadEconomica: 620100,
        direccion: 'Calle Test 123',
        comuna: 'Santiago'
      }),
      receptor: Receiver.create({
        rut: Rut.of('6-K'),
        razonSocial: 'Receptor SA',
        giro: 'Comercio',
        direccion: 'Av Test 456',
        comuna: 'Santiago'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Licencia Software',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(10000)
        })
      ]
    });

    inv.assignFolio(50);

    const caf = Caf.create({
      tenantId,
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

    return inv;
  };

  it('debe generar el XML, validarlo contra XSD y transicionar la factura a BUILT', async () => {
    const useCase = new BuildDteXmlUseCase();
    const invoice = createStampedInvoice('tenant-123');

    const result = await useCase.execute({
      tenantId: 'tenant-123',
      invoice
    });

    expect(result.invoice.estado).toBe(InvoiceStatus.BUILT);
    expect(result.invoice.dteXml).toBeDefined();
    expect(result.xml).toContain('<Documento ID="F50T33">');
  });

  it('debe rechazar facturas que no estén en estado STAMPED', async () => {
    const useCase = new BuildDteXmlUseCase();
    const invoice = Invoice.createDraft({
      tenantId: 'tenant-123',
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor',
        giro: 'Giro',
        actividadEconomica: 620100,
        direccion: 'Dir',
        comuna: 'Comuna'
      }),
      receptor: Receiver.create({
        rut: Rut.of('6-K'),
        razonSocial: 'Recep',
        giro: 'Giro',
        direccion: 'Dir',
        comuna: 'Comuna'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Item',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(1000)
        })
      ]
    });

    await expect(
      useCase.execute({
        tenantId: 'tenant-123',
        invoice
      })
    ).rejects.toThrow(FiscalValidationError);
  });

  it('debe fallar si el tenantId no coincide', async () => {
    const useCase = new BuildDteXmlUseCase();
    const invoice = createStampedInvoice('tenant-123');

    await expect(
      useCase.execute({
        tenantId: 'otro-tenant',
        invoice
      })
    ).rejects.toThrow(TenantMismatchError);
  });
});
