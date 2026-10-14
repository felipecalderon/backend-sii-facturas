import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { SignDteUseCase } from './sign-dte.use-case.js';
import { CertificateRepository } from '../../domain/certificate/ports/certificate.repository.js';
import { DigitalCertificate } from '../../domain/certificate/values/digital-certificate.vo.js';
import { createEphemeralCertificate } from '../../infrastructure/crypto/test-cert-helper.js';
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
import { DteXmlRenderer } from '../../infrastructure/xml/dte-xml-renderer.js';
import { TenantMismatchError } from '../../domain/folio/errors/folio-domain.error.js';
import { NoActiveCertificateError } from '../../domain/certificate/errors/certificate-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

describe('SignDteUseCase', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });

  const getBuiltInvoice = (tenantId = 'tenant-test'): Invoice => {
    const inv = Invoice.createDraft({
      tenantId,
      fechaEmision: new Date('2026-09-03'),
      emisor: Issuer.create({
        rut: Rut.of('76123456-0'),
        razonSocial: 'Emisor SpA',
        giro: 'Servicios',
        actividadEconomica: 620100,
        direccion: 'Calle 1',
        comuna: 'Santiago'
      }),
      receptor: Receiver.create({
        rut: Rut.of('6-K'),
        razonSocial: 'Receptor SA',
        giro: 'Giro',
        direccion: 'Calle 2',
        comuna: 'Santiago'
      }),
      items: [
        InvoiceItem.create({
          linea: 1,
          nombre: 'Item Test',
          cantidad: Money.fromInteger(1),
          precioUnitario: Money.fromInteger(10000)
        })
      ]
    });

    inv.assignFolio(10);

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

    const xml = DteXmlRenderer.render(inv);
    inv.setDteXml(xml);

    return inv;
  };

  const getTestCertificate = (): DigitalCertificate => {
    const ephem = createEphemeralCertificate('pass', '16123456-7');
    return DigitalCertificate.create({
      rutTitular: Rut.of(ephem.rutTitular),
      privateKeyPem: ephem.privateKeyPem,
      certificatePem: ephem.certificatePem,
      validFrom: new Date(Date.now() - 1000 * 60 * 60),
      validTo: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
    });
  };

  it('debe firmar exitosamente la factura, transicionar a SIGNED y asignar signedDteXml', async () => {
    const cert = getTestCertificate();
    const mockRepo: CertificateRepository = {
      saveEncryptedCertificate: vi.fn(),
      findActiveCertificate: vi.fn().mockResolvedValue(cert)
    };

    const useCase = new SignDteUseCase(mockRepo);
    const invoice = getBuiltInvoice('tenant-test');

    const result = await useCase.execute({
      tenantId: 'tenant-test',
      invoice
    });

    expect(result.invoice.estado).toBe(InvoiceStatus.SIGNED);
    expect(result.invoice.signedDteXml).toBeDefined();
    expect(result.signedDteXml).toContain(
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">'
    );
    expect(result.signedDteXml).toMatch(/<KeyValue>\s*<RSAKeyValue>/);
  });

  it('debe lanzar TenantMismatchError si el tenantId no coincide', async () => {
    const mockRepo: CertificateRepository = {
      saveEncryptedCertificate: vi.fn(),
      findActiveCertificate: vi.fn()
    };

    const useCase = new SignDteUseCase(mockRepo);
    const invoice = getBuiltInvoice('tenant-test');

    await expect(
      useCase.execute({
        tenantId: 'otro-tenant',
        invoice
      })
    ).rejects.toThrow(TenantMismatchError);
  });

  it('debe rechazar facturas que no estén en estado BUILT', async () => {
    const mockRepo: CertificateRepository = {
      saveEncryptedCertificate: vi.fn(),
      findActiveCertificate: vi.fn()
    };

    const useCase = new SignDteUseCase(mockRepo);
    const invoice = Invoice.createDraft({
      tenantId: 'tenant-test',
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
        tenantId: 'tenant-test',
        invoice
      })
    ).rejects.toThrow(FiscalValidationError);
  });

  it('debe fallar si no existe certificado activo para el tenant', async () => {
    const mockRepo: CertificateRepository = {
      saveEncryptedCertificate: vi.fn(),
      findActiveCertificate: vi.fn().mockResolvedValue(null)
    };

    const useCase = new SignDteUseCase(mockRepo);
    const invoice = getBuiltInvoice('tenant-test');

    await expect(
      useCase.execute({
        tenantId: 'tenant-test',
        invoice
      })
    ).rejects.toThrow(NoActiveCertificateError);
  });
});
