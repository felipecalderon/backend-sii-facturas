import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IssueInvoiceUseCase,
  IssueInvoiceDto
} from './issue-invoice.use-case.js';
import {
  Invoice,
  InvoiceStatus
} from '../../domain/dte/entities/invoice.entity.js';
import { Issuer } from '../../domain/dte/entities/issuer.entity.js';
import { Receiver } from '../../domain/dte/entities/receiver.entity.js';
import { InvoiceItem } from '../../domain/dte/entities/invoice-item.entity.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { Money } from '../../domain/shared/money.vo.js';
import { Caf } from '../../domain/folio/entities/caf.entity.js';
import { FolioRepository } from '../../domain/folio/ports/folio.repository.js';
import { CertificateRepository } from '../../domain/certificate/ports/certificate.repository.js';
import { InvoiceRepository } from '../../domain/dte/ports/invoice.repository.js';
import { StampInvoiceUseCase } from './stamp-invoice.use-case.js';
import { BuildDteXmlUseCase } from './build-dte-xml.use-case.js';
import { SignDteUseCase } from './sign-dte.use-case.js';
import { CreateEnvioDteUseCase } from './create-envio-dte.use-case.js';
import { SubmitEnvioDteUseCase } from './submit-envio-dte.use-case.js';
import { QueryEnvioStatusUseCase } from './query-envio-status.use-case.js';
import { SiiGateway } from '../../domain/sii/ports/sii-gateway.port.js';
import { SiiConnectionError } from '../../domain/sii/errors/sii-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import { createEphemeralCertificate } from '../../infrastructure/crypto/test-cert-helper.js';
import { DigitalCertificate } from '../../domain/certificate/values/digital-certificate.vo.js';

class InMemoryInvoiceRepository implements InvoiceRepository {
  public invoicesByFolio = new Map<string, Invoice>();
  public invoicesByIdemp = new Map<string, Invoice>();
  public saveCalls: { invoice: Invoice; estado: InvoiceStatus }[] = [];

  public async save(invoice: Invoice): Promise<void> {
    this.saveCalls.push({ invoice, estado: invoice.estado });
    if (invoice.folio !== undefined) {
      this.invoicesByFolio.set(
        `${invoice.tenantId}:${invoice.tipoDte.code}:${invoice.folio}`,
        invoice
      );
    }
    if (invoice.idempotencyKey) {
      this.invoicesByIdemp.set(
        `${invoice.tenantId}:${invoice.idempotencyKey}`,
        invoice
      );
    }
  }

  public async findByFolio(
    tenantId: string,
    tipoDte: TipoDte,
    folio: number
  ): Promise<Invoice | null> {
    return (
      this.invoicesByFolio.get(`${tenantId}:${tipoDte.code}:${folio}`) ?? null
    );
  }

  public async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<Invoice | null> {
    return this.invoicesByIdemp.get(`${tenantId}:${idempotencyKey}`) ?? null;
  }
}

describe('M6 End-to-End: IssueInvoiceUseCase', () => {
  let issueInvoiceUseCase: IssueInvoiceUseCase;
  let inMemoryInvoiceRepo: InMemoryInvoiceRepository;
  let mockFolioRepo: FolioRepository;
  let mockCertRepo: CertificateRepository;
  let mockStampUseCase: StampInvoiceUseCase;
  let mockBuildXmlUseCase: BuildDteXmlUseCase;
  let mockSignUseCase: SignDteUseCase;
  let mockCreateEnvioUseCase: CreateEnvioDteUseCase;
  let mockSubmitEnvioUseCase: SubmitEnvioDteUseCase;
  let digitalCert: DigitalCertificate;

  const tenantId = 'tenant-m6-e2e';
  let currentFolio = 100;

  const validIssuer = Issuer.create({
    rut: Rut.of('76123456-0'),
    razonSocial: 'Empresa Emisora SpA',
    giro: 'Servicios de TI',
    actividadEconomica: 620100,
    direccion: 'Av. Andrés Bello 2777',
    comuna: 'Las Condes',
    fchResol: '2026-09-01',
    nroResol: 80
  });

  const validReceiver = Receiver.create({
    rut: Rut.of('55666777-2'),
    razonSocial: 'Cliente Receptor S.A.',
    giro: 'Comercio Mayorista',
    direccion: 'Avenida Providencia 1234',
    comuna: 'Providencia'
  });

  const createValidItems = (): InvoiceItem[] => [
    InvoiceItem.create({
      linea: 1,
      nombre: 'Servicio Cloud Premium',
      cantidad: Money.fromInteger(1),
      precioUnitario: Money.fromInteger(50000)
    })
  ];

  beforeEach(() => {
    currentFolio = 100;
    inMemoryInvoiceRepo = new InMemoryInvoiceRepository();

    const certData = createEphemeralCertificate('cert-pass-123', '76123456-0');
    digitalCert = DigitalCertificate.create({
      privateKeyPem: certData.privateKeyPem,
      certificatePem: certData.certificatePem,
      rutTitular: Rut.of(certData.rutTitular),
      validFrom: new Date(Date.now() - 3600000),
      validTo: new Date(Date.now() + 3600000 * 24 * 365)
    });

    mockFolioRepo = {
      saveCaf: vi.fn(),
      findActiveCaf: vi.fn(),
      allocateNextFolio: vi.fn().mockImplementation(async () => {
        currentFolio += 1;
        return { folio: currentFolio, caf: {} as any };
      }),
      getFolioStatus: vi.fn()
    };

    mockCertRepo = {
      saveEncryptedCertificate: vi.fn(),
      findActiveCertificate: vi.fn().mockResolvedValue(digitalCert)
    };

    mockStampUseCase = {
      execute: vi.fn().mockImplementation(async ({ invoice }) => {
        invoice.stampTed('<TED version="1.0"><DD></DD></TED>');
        return { invoice, ted: {} as any };
      })
    } as any;

    mockBuildXmlUseCase = {
      execute: vi.fn().mockImplementation(async ({ invoice }) => {
        invoice.setDteXml(
          `<DTE version="1.0"><Documento ID="F${invoice.folio}T33"></Documento></DTE>`
        );
        return { invoice, xml: invoice.dteXml! };
      })
    } as any;

    mockSignUseCase = {
      execute: vi.fn().mockImplementation(async ({ invoice }) => {
        invoice.sign(
          `<DTE version="1.0"><Documento ID="F${invoice.folio}T33"></Documento><Signature>FirmaDTE</Signature></DTE>`
        );
        return { invoice, signedDteXml: invoice.signedDteXml! };
      })
    } as any;

    mockCreateEnvioUseCase = {
      execute: vi.fn().mockResolvedValue({
        envioDteXml: '<EnvioDTE version="1.0"><SetDTE></SetDTE></EnvioDTE>',
        totalDtes: 1
      })
    } as any;

    mockSubmitEnvioUseCase = {
      execute: vi.fn().mockImplementation(async ({ invoices }) => {
        for (const inv of invoices) {
          inv.markSubmitted('TRACK-SII-998877');
        }
        return {
          trackId: 'TRACK-SII-998877',
          environment: 'CERTIFICATION',
          invoices
        };
      })
    } as any;

    issueInvoiceUseCase = new IssueInvoiceUseCase(
      mockFolioRepo,
      mockCertRepo,
      inMemoryInvoiceRepo,
      mockStampUseCase,
      mockBuildXmlUseCase,
      mockSignUseCase,
      mockCreateEnvioUseCase,
      mockSubmitEnvioUseCase
    );
  });

  it('1-6. Ejecuta exitosamente el flujo completo de emisión E2E hasta SUBMITTED con TrackID', async () => {
    const dto: IssueInvoiceDto = {
      tenantId,
      fechaEmision: new Date('2026-09-04'),
      emisor: validIssuer,
      receptor: validReceiver,
      items: createValidItems(),
      idempotencyKey: 'idemp-tx-001'
    };

    const result = await issueInvoiceUseCase.execute(dto);

    // 1. Recibir factura y validar resultado
    expect(result.folio).toBe(101);
    expect(result.trackId).toBe('TRACK-SII-998877');
    expect(result.estado).toBe(InvoiceStatus.SUBMITTED);
    expect(result.isDuplicate).toBe(false);

    // 2. Asignación atómica de folio del CAF
    expect(mockFolioRepo.allocateNextFolio).toHaveBeenCalledWith(
      tenantId,
      expect.anything()
    );

    // 3. Timbrar DTE (TED)
    expect(mockStampUseCase.execute).toHaveBeenCalled();
    expect(result.invoice.tedXml).toContain('<TED');

    // 4. Construir y validar XML DTE
    expect(mockBuildXmlUseCase.execute).toHaveBeenCalled();
    expect(result.invoice.dteXml).toContain('<DTE');

    // 5. Firma digital XMLDSig
    expect(mockSignUseCase.execute).toHaveBeenCalled();
    expect(result.invoice.signedDteXml).toContain('<Signature>');

    // 6. Transmisión SII y TrackID
    expect(mockSubmitEnvioUseCase.execute).toHaveBeenCalled();
    expect(result.invoice.trackId).toBe('TRACK-SII-998877');

    // La carátula debe enviar la resolución configurada del emisor y el RUT del certificado
    expect(mockCreateEnvioUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        fchResol: '2026-09-01',
        nroResol: 80,
        rutEnvia: '76123456-0'
      })
    );
  });

  it('rechaza antes de consumir folio si el emisor no tiene resolución de autorización configurada', async () => {
    const emisorSinResolucion = Issuer.create({
      rut: Rut.of('76123456-0'),
      razonSocial: 'Empresa Emisora SpA',
      giro: 'Servicios de TI',
      actividadEconomica: 620100,
      direccion: 'Av. Andrés Bello 2777',
      comuna: 'Las Condes'
    });

    const dto: IssueInvoiceDto = {
      tenantId,
      fechaEmision: new Date('2026-09-04'),
      emisor: emisorSinResolucion,
      receptor: validReceiver,
      items: createValidItems(),
      idempotencyKey: 'idemp-sin-resolucion'
    };

    await expect(issueInvoiceUseCase.execute(dto)).rejects.toThrow(
      FiscalValidationError
    );
    expect(mockFolioRepo.allocateNextFolio).not.toHaveBeenCalled();
    expect(inMemoryInvoiceRepo.saveCalls).toHaveLength(0);
  });

  it('entrega al timbrado el mismo CAF que asignó el folio', async () => {
    const assignedCaf = Caf.create({
      tenantId,
      tipoDte: TipoDte.facturaElectronica(),
      rangoDesde: 1,
      rangoHasta: 200,
      ultimoFolioAsignado: 101,
      clavePrivadaPem: digitalCert.privateKeyPem,
      cafXml: '<CAF version="1.0"><DA></DA></CAF>',
      fechaAutorizacion: new Date('2026-09-03'),
      rutEmisor: validIssuer.rut,
      activo: true
    });
    (
      mockFolioRepo.allocateNextFolio as unknown as {
        mockResolvedValue: (value: unknown) => void;
      }
    ).mockResolvedValue({ folio: 101, caf: assignedCaf });

    const dto: IssueInvoiceDto = {
      tenantId,
      fechaEmision: new Date('2026-09-04'),
      emisor: validIssuer,
      receptor: validReceiver,
      items: createValidItems(),
      idempotencyKey: 'idemp-mismo-caf'
    };

    await issueInvoiceUseCase.execute(dto);

    expect(mockStampUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        caf: assignedCaf
      })
    );
  });

  it('7. Cumple el Principio Fiscal #4: Persistencia antes de transmisión', async () => {
    const dto: IssueInvoiceDto = {
      tenantId,
      fechaEmision: new Date('2026-09-04'),
      emisor: validIssuer,
      receptor: validReceiver,
      items: createValidItems(),
      idempotencyKey: 'idemp-persist-first'
    };

    await issueInvoiceUseCase.execute(dto);

    // Debe haber al menos 2 guardados en el repositorio:
    // Primero en estado PERSISTED (antes de transmitir) y luego en SUBMITTED (después de transmitir)
    expect(inMemoryInvoiceRepo.saveCalls.length).toBeGreaterThanOrEqual(2);
    const firstSave = inMemoryInvoiceRepo.saveCalls[0];
    const lastSave =
      inMemoryInvoiceRepo.saveCalls[inMemoryInvoiceRepo.saveCalls.length - 1];

    expect(firstSave.estado).toBe(InvoiceStatus.PERSISTED);
    expect(lastSave.estado).toBe(InvoiceStatus.SUBMITTED);
  });

  it('8. Idempotencia: reintentar la operación con la misma idempotencyKey no consume otro folio ni retransmite', async () => {
    const dto: IssueInvoiceDto = {
      tenantId,
      fechaEmision: new Date('2026-09-04'),
      emisor: validIssuer,
      receptor: validReceiver,
      items: createValidItems(),
      idempotencyKey: 'idemp-duplicate-safe'
    };

    // Primer intento
    const firstResult = await issueInvoiceUseCase.execute(dto);
    expect(firstResult.folio).toBe(101);
    expect(firstResult.isDuplicate).toBe(false);
    expect(mockFolioRepo.allocateNextFolio).toHaveBeenCalledTimes(1);
    expect(mockSubmitEnvioUseCase.execute).toHaveBeenCalledTimes(1);

    // Segundo intento con la misma idempotencyKey
    const secondResult = await issueInvoiceUseCase.execute(dto);
    expect(secondResult.folio).toBe(101);
    expect(secondResult.trackId).toBe(firstResult.trackId);
    expect(secondResult.estado).toBe(InvoiceStatus.SUBMITTED);
    expect(secondResult.isDuplicate).toBe(true);

    // No debe haber consumido un nuevo folio ni vuelto a llamar a la transmisión
    expect(mockFolioRepo.allocateNextFolio).toHaveBeenCalledTimes(1);
    expect(mockSubmitEnvioUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('Regla de incertidumbre: error de conexión transiciona a UNKNOWN y persiste sin rechazar', async () => {
    mockSubmitEnvioUseCase.execute = vi.fn().mockImplementation(async () => {
      // Simula el comportamiento de submitEnvioDteUseCase ante fallo de red
      throw new SiiConnectionError(
        'Timeout conectando al servidor Maullin del SII'
      );
    });

    const dto: IssueInvoiceDto = {
      tenantId,
      fechaEmision: new Date('2026-09-04'),
      emisor: validIssuer,
      receptor: validReceiver,
      items: createValidItems(),
      idempotencyKey: 'idemp-connection-failure'
    };

    await expect(issueInvoiceUseCase.execute(dto)).rejects.toThrow(
      SiiConnectionError
    );

    // La factura debe quedar persistida en el repositorio
    const persisted = await inMemoryInvoiceRepo.findByIdempotencyKey(
      tenantId,
      'idemp-connection-failure'
    );
    expect(persisted).not.toBeNull();
    expect(persisted!.estado).toBe(InvoiceStatus.UNKNOWN);
    expect(persisted!.folio).toBe(101);
  });

  it('Reintento de factura en UNKNOWN reutiliza el folio asignado y no consume uno nuevo', async () => {
    // 1. Simular primer intento fallido por conexión
    mockSubmitEnvioUseCase.execute = vi
      .fn()
      .mockRejectedValueOnce(
        new SiiConnectionError('Fallo temporal de conexión')
      )
      .mockImplementationOnce(async ({ invoices }) => {
        for (const inv of invoices) {
          inv.markSubmitted('TRACK-RETRY-SUCCESS');
        }
        return {
          trackId: 'TRACK-RETRY-SUCCESS',
          environment: 'CERTIFICATION',
          invoices
        };
      });

    const dto: IssueInvoiceDto = {
      tenantId,
      fechaEmision: new Date('2026-09-04'),
      emisor: validIssuer,
      receptor: validReceiver,
      items: createValidItems(),
      idempotencyKey: 'idemp-retry-test'
    };

    await expect(issueInvoiceUseCase.execute(dto)).rejects.toThrow(
      SiiConnectionError
    );
    expect(mockFolioRepo.allocateNextFolio).toHaveBeenCalledTimes(1);

    // 2. Reintento con la misma idempotencyKey una vez restaurada la red
    const retryResult = await issueInvoiceUseCase.execute(dto);
    expect(retryResult.folio).toBe(101); // Mismo folio!
    expect(retryResult.trackId).toBe('TRACK-RETRY-SUCCESS');
    expect(retryResult.estado).toBe(InvoiceStatus.SUBMITTED);
    expect(mockFolioRepo.allocateNextFolio).toHaveBeenCalledTimes(1); // No consumió otro folio
  });

  it('Consulta de estado: QueryEnvioStatusUseCase actualiza y persiste estado ACCEPTED de la factura', async () => {
    const dto: IssueInvoiceDto = {
      tenantId,
      fechaEmision: new Date('2026-09-04'),
      emisor: validIssuer,
      receptor: validReceiver,
      items: createValidItems(),
      idempotencyKey: 'idemp-query-status'
    };

    const issueResult = await issueInvoiceUseCase.execute(dto);

    // Crear gateway mock para consultar estado
    const mockGateway: SiiGateway = {
      getSeed: vi.fn(),
      getToken: vi.fn(),
      sendDte: vi.fn(),
      querySendStatus: vi.fn().mockResolvedValue({
        trackId: issueResult.trackId,
        status: 'EPR',
        glosa: 'Envio Procesado'
      })
    };

    const mockAuthUseCase = {
      execute: vi.fn().mockResolvedValue({ token: 'VALID_TOKEN' })
    } as any;

    const queryUseCase = new QueryEnvioStatusUseCase(
      mockAuthUseCase,
      mockGateway,
      inMemoryInvoiceRepo
    );

    const queryResult = await queryUseCase.execute({
      tenantId,
      trackId: issueResult.trackId,
      rutCompany: validIssuer.rut,
      invoices: [issueResult.invoice]
    });

    expect(queryResult.status).toBe('EPR');
    expect(issueResult.invoice.estado).toBe(InvoiceStatus.ACCEPTED);

    // Verificar que se persistió el estado ACCEPTED en el repositorio
    const persisted = await inMemoryInvoiceRepo.findByFolio(
      tenantId,
      TipoDte.facturaElectronica(),
      issueResult.folio
    );
    expect(persisted!.estado).toBe(InvoiceStatus.ACCEPTED);
  });

  it('Lanza FiscalValidationError si tenantId está vacío', async () => {
    const dto: IssueInvoiceDto = {
      tenantId: '   ',
      fechaEmision: new Date(),
      emisor: validIssuer,
      receptor: validReceiver,
      items: createValidItems()
    };

    await expect(issueInvoiceUseCase.execute(dto)).rejects.toThrow(
      FiscalValidationError
    );
  });
});
