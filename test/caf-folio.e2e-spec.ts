import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi
} from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import type { Model } from 'mongoose';
import crypto from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import {
  SII_GATEWAY_TOKEN,
  type SiiGateway
} from '../src/domain/sii/ports/sii-gateway.port.js';
import { FiscalExceptionFilter } from '../src/infrastructure/http/filters/fiscal-exception.filter.js';
import { createEphemeralCertificate } from '../src/infrastructure/crypto/test-cert-helper.js';
import type { CafDocument } from '../src/infrastructure/persistence/mongo/schemas/caf.schema.js';
import type { CertificateDocument } from '../src/infrastructure/persistence/mongo/schemas/certificate.schema.js';
import type { InvoiceDocument } from '../src/infrastructure/persistence/mongo/schemas/invoice.schema.js';
import type { IssuerDocument } from '../src/infrastructure/persistence/mongo/schemas/issuer.schema.js';

const CAF_RUT = '76123456-0';
const CERT_PASSWORD = 'cert-password-e2e';

const certificate = createEphemeralCertificate(CERT_PASSWORD, CAF_RUT);
const cafKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});

const base64UrlToBase64 = (value: string): string => {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return base64;
};

const createCafXml = (rangoDesde: number, rangoHasta: number): string => {
  const publicKey = crypto
    .createPublicKey(cafKeyPair.privateKey)
    .export({ format: 'jwk' });

  return `<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${CAF_RUT}</RE>
      <RS>EMISOR E2E SPA</RS>
      <TD>33</TD>
      <RNG>
        <D>${rangoDesde}</D>
        <H>${rangoHasta}</H>
      </RNG>
      <FA>2026-09-07</FA>
      <RSAPK>
        <M>${base64UrlToBase64(publicKey.n ?? '')}</M>
        <E>${base64UrlToBase64(publicKey.e ?? '')}</E>
      </RSAPK>
      <IDK>${1000 + rangoDesde}</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">AA==</FRMA>
  </CAF>
  <RSASK>${cafKeyPair.privateKey}</RSASK>
</AUTORIZACION>`;
};

const invoiceBody = {
  receptor: {
    rut: '55666777-2',
    razonSocial: 'Cliente Receptor E2E SpA',
    giro: 'Comercio Mayorista',
    direccion: 'Avenida Providencia 1234',
    comuna: 'Providencia',
    ciudad: 'Santiago',
    correo: 'receptor-e2e@example.cl'
  },
  items: [
    {
      linea: 1,
      nombre: 'Servicio E2E',
      cantidad: 1,
      precioUnitario: 10000
    }
  ],
  environment: 'CERTIFICATION',
  validateXsd: false
};

describe('CAFs y emisión de DTE (E2E con MongoDB)', () => {
  let app: INestApplication;
  let cafModel: Model<CafDocument>;
  let certificateModel: Model<CertificateDocument>;
  let invoiceModel: Model<InvoiceDocument>;
  let issuerModel: Model<IssuerDocument>;
  let tenantCounter = 0;

  const nextTenantId = (suffix: string): string =>
    `e2e-${process.pid}-${Date.now().toString(36)}-${suffix}-${++tenantCounter}`;

  const cleanupE2eData = async (): Promise<void> => {
    if (!cafModel) {
      return;
    }
    const tenantPrefix = /^e2e-/;
    await Promise.all([
      cafModel.deleteMany({ tenantId: tenantPrefix }).exec(),
      certificateModel.deleteMany({ tenantId: tenantPrefix }).exec(),
      invoiceModel.deleteMany({ tenantId: tenantPrefix }).exec(),
      issuerModel.deleteMany({ tenantId: tenantPrefix }).exec()
    ]);
  };

  beforeAll(async () => {
    const gateway: SiiGateway = {
      getSeed: vi.fn().mockResolvedValue('<SEMILLA>E2E</SEMILLA>'),
      getToken: vi.fn().mockResolvedValue('TOKEN-E2E'),
      sendDte: vi.fn().mockResolvedValue({
        trackId: 'TRACK-E2E',
        status: 'EPR',
        rawResponse: '<RESP_HDR><TRACKID>TRACK-E2E</TRACKID></RESP_HDR>'
      }),
      querySendStatus: vi.fn().mockResolvedValue({
        status: 'EPR',
        glosa: 'Envio Procesado'
      })
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(SII_GATEWAY_TOKEN)
      .useValue(gateway)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true })
    );
    app.useGlobalFilters(new FiscalExceptionFilter());
    await app.init();

    cafModel = app.get<Model<CafDocument>>(getModelToken('Caf'));
    certificateModel = app.get<Model<CertificateDocument>>(
      getModelToken('Certificate')
    );
    invoiceModel = app.get<Model<InvoiceDocument>>(getModelToken('Invoice'));
    issuerModel = app.get<Model<IssuerDocument>>(getModelToken('Issuer'));

    await cleanupE2eData();
    await Promise.all([
      cafModel.init(),
      certificateModel.init(),
      invoiceModel.init(),
      issuerModel.init()
    ]);
  });

  beforeEach(async () => {
    await cleanupE2eData();
  });

  afterAll(async () => {
    await cleanupE2eData();
    await app.close();
  });

  const server = () => app.getHttpServer();

  const configureIssuer = (tenantId: string) =>
    request(server())
      .put('/tenants/issuer')
      .set('x-tenant-id', tenantId)
      .send({
        rut: CAF_RUT,
        razonSocial: 'Emisor E2E SpA',
        giro: 'Servicios de TI',
        actividadEconomica: 620100,
        direccion: 'Av. Providencia 1234',
        comuna: 'Providencia',
        ciudad: 'Santiago',
        correo: `facturacion-${tenantId}@example.cl`,
        telefono: '+56911223344'
      });

  const uploadCertificate = (tenantId: string) =>
    request(server())
      .post('/certificates')
      .set('x-tenant-id', tenantId)
      .field('password', CERT_PASSWORD)
      .field('rutTitular', CAF_RUT)
      .attach('file', certificate.p12Buffer, {
        filename: 'certificate-e2e.p12',
        contentType: 'application/x-pkcs12'
      });

  const setupIssuerAndCertificate = async (tenantId: string): Promise<void> => {
    await configureIssuer(tenantId).expect(200);
    await uploadCertificate(tenantId).expect(201);
  };

  const importCaf = (tenantId: string, xmlContent: string) =>
    request(server())
      .post('/cafs')
      .set('x-tenant-id', tenantId)
      .attach('file', Buffer.from(xmlContent, 'utf-8'), {
        filename: 'caf_33.xml',
        contentType: 'application/xml'
      });

  const issueInvoice = (
    tenantId: string,
    idempotencyKey: string,
    expectedStatus = 201
  ) =>
    request(server())
      .post('/invoices')
      .set('x-tenant-id', tenantId)
      .set('idempotency-key', idempotencyKey)
      .send(invoiceBody)
      .expect(expectedStatus);

  const getFolioStatus = (tenantId: string) =>
    request(server())
      .get('/folios/status')
      .set('x-tenant-id', tenantId)
      .query({ tipoDte: 33 });

  it('reimportar el mismo XML de CAF no duplica documentos ni reinicia folios', async () => {
    const tenantId = nextTenantId('duplicado');
    const cafXml = createCafXml(1, 10);

    const first = await importCaf(tenantId, cafXml);
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(true);

    const second = await importCaf(tenantId, cafXml);
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);

    const cafs = await cafModel.find({ tenantId }).lean().exec();
    expect(cafs).toHaveLength(1);
    expect(cafs[0].cafHash).toMatch(/^[a-f0-9]{64}$/);

    const status = await getFolioStatus(tenantId).expect(200);
    expect(status.body.ultimoAsignado).toBe(0);
    expect(status.body.activo).toBe(true);
  });

  it('consumir un folio y reimportar el mismo CAF mantiene la secuencia', async () => {
    const tenantId = nextTenantId('secuencia');
    await setupIssuerAndCertificate(tenantId);
    const cafXml = createCafXml(1, 3);
    await importCaf(tenantId, cafXml).expect(201);

    const firstEmission = await issueInvoice(tenantId, 'e2e-sec-1');
    expect(firstEmission.status).toBe(201);
    expect(firstEmission.body.folio).toBe(1);

    const reimport = await importCaf(tenantId, cafXml);
    expect(reimport.status).toBe(200);
    expect(reimport.body.created).toBe(false);

    const statusAfterReimport = await getFolioStatus(tenantId).expect(200);
    expect(statusAfterReimport.body.ultimoAsignado).toBe(1);

    const secondEmission = await issueInvoice(tenantId, 'e2e-sec-2');
    expect(secondEmission.status).toBe(201);
    expect(secondEmission.body.folio).toBe(2);

    const cafs = await cafModel.find({ tenantId }).lean().exec();
    expect(cafs).toHaveLength(1);
  });

  it('un CAF de rango 1-2 timbra las dos emisiones y la tercera responde 409 por folios agotados', async () => {
    const tenantId = nextTenantId('agotado');
    await setupIssuerAndCertificate(tenantId);
    await importCaf(tenantId, createCafXml(1, 2)).expect(201);

    const firstEmission = await issueInvoice(tenantId, 'e2e-rango-1');
    expect(firstEmission.status).toBe(201);
    expect(firstEmission.body.folio).toBe(1);

    const secondEmission = await issueInvoice(tenantId, 'e2e-rango-2');
    expect(secondEmission.status).toBe(201);
    expect(secondEmission.body.folio).toBe(2);

    const thirdEmission = await issueInvoice(tenantId, 'e2e-rango-3', 409);
    expect(thirdEmission.status).toBe(409);
    expect(thirdEmission.body.message).toContain('Folios agotados');
  });

  it('importar un CAF distinto del mismo tipo deja un único CAF activo', async () => {
    const tenantId = nextTenantId('distinto');
    await importCaf(tenantId, createCafXml(1, 2)).expect(201);
    await importCaf(tenantId, createCafXml(10, 12)).expect(201);

    const cafs = await cafModel.find({ tenantId }).lean().exec();
    const activeCafs = cafs.filter((caf) => caf.activo === true);
    const inactiveCafs = cafs.filter((caf) => caf.activo === false);

    expect(cafs).toHaveLength(2);
    expect(activeCafs).toHaveLength(1);
    expect(inactiveCafs).toHaveLength(1);
    expect(activeCafs[0].rangoDesde).toBe(10);
    expect(inactiveCafs[0].rangoHasta).toBe(2);
  });

  it('dos POST /cafs simultáneos con el mismo XML no dejan duplicados ni dos CAF activos', async () => {
    const tenantId = nextTenantId('concurrente');
    const cafXml = createCafXml(1, 10);

    const responses = await Promise.all([
      importCaf(tenantId, cafXml),
      importCaf(tenantId, cafXml)
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 201
    ]);

    const cafs = await cafModel.find({ tenantId }).lean().exec();
    expect(cafs).toHaveLength(1);
    expect(cafs.filter((caf) => caf.activo === true)).toHaveLength(1);
    expect(cafs[0].ultimoFolioAsignado).toBe(0);
  });

  it('sin CAF registrado la emisión conserva el error 412', async () => {
    const tenantId = nextTenantId('sin-caf');
    await setupIssuerAndCertificate(tenantId);

    const response = await issueInvoice(tenantId, 'e2e-sin-caf', 412);
    expect(response.status).toBe(412);
    expect(response.body.message).toContain('No existe un CAF activo');
  });
});
