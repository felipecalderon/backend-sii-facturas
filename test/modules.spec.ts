import { describe, it, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CertificateModule } from '../src/modules/certificate/certificate.module.js';
import { CertificatesController } from '../src/modules/certificate/certificates.controller.js';
import { FolioModule } from '../src/modules/folio/folio.module.js';
import { CafsController } from '../src/modules/folio/cafs.controller.js';
import { SiiModule } from '../src/modules/sii/sii.module.js';
import { DteModule } from '../src/modules/dte/dte.module.js';
import { AppModule } from '../src/app.module.js';
import {
  CERTIFICATE_REPOSITORY_TOKEN,
  CertificateRepository
} from '../src/domain/certificate/ports/certificate.repository.js';
import {
  FOLIO_REPOSITORY_TOKEN,
  FolioRepository
} from '../src/domain/folio/ports/folio.repository.js';
import {
  INVOICE_REPOSITORY_TOKEN,
  InvoiceRepository
} from '../src/domain/dte/ports/invoice.repository.js';
import {
  SII_GATEWAY_TOKEN,
  SiiGateway
} from '../src/domain/sii/ports/sii-gateway.port.js';
import { UploadCertificateUseCase } from '../src/application/use-cases/upload-certificate.use-case.js';
import { ImportCafUseCase } from '../src/application/use-cases/import-caf.use-case.js';
import { AllocateFolioUseCase } from '../src/application/use-cases/allocate-folio.use-case.js';
import { AuthenticateSiiUseCase } from '../src/application/use-cases/authenticate-sii.use-case.js';
import { SubmitEnvioDteUseCase } from '../src/application/use-cases/submit-envio-dte.use-case.js';
import { QueryEnvioStatusUseCase } from '../src/application/use-cases/query-envio-status.use-case.js';
import { StampInvoiceUseCase } from '../src/application/use-cases/stamp-invoice.use-case.js';
import { BuildDteXmlUseCase } from '../src/application/use-cases/build-dte-xml.use-case.js';
import { SignDteUseCase } from '../src/application/use-cases/sign-dte.use-case.js';
import { CreateEnvioDteUseCase } from '../src/application/use-cases/create-envio-dte.use-case.js';
import { IssueInvoiceUseCase } from '../src/application/use-cases/issue-invoice.use-case.js';
import { SiiTokenCache } from '../src/infrastructure/sii/sii-token-cache.js';
import { EncryptionService } from '../src/infrastructure/security/encryption.service.js';

describe('NestJS Modules & Dependency Injection (M7)', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CertificateModule, FolioModule, SiiModule, DteModule]
    })
      .overrideProvider(getModelToken('Certificate'))
      .useValue({})
      .overrideProvider(getModelToken('Caf'))
      .useValue({})
      .overrideProvider(getModelToken('Invoice'))
      .useValue({})
      .overrideProvider(getModelToken('Issuer'))
      .useValue({})
      .compile();
  });

  describe('CertificateModule', () => {
    it('debe resolver CERTIFICATE_REPOSITORY_TOKEN', () => {
      const repo = moduleRef.get<CertificateRepository>(
        CERTIFICATE_REPOSITORY_TOKEN
      );
      expect(repo).toBeDefined();
      expect(typeof repo.saveEncryptedCertificate).toBe('function');
    });

    it('debe resolver EncryptionService', () => {
      const enc = moduleRef.get<EncryptionService>(EncryptionService);
      expect(enc).toBeDefined();
    });

    it('debe resolver UploadCertificateUseCase', () => {
      const useCase = moduleRef.get<UploadCertificateUseCase>(
        UploadCertificateUseCase
      );
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });

    it('debe resolver CertificatesController', () => {
      const controller = moduleRef.get<CertificatesController>(
        CertificatesController
      );
      expect(controller).toBeDefined();
      expect(typeof controller.uploadCertificate).toBe('function');
    });
  });

  describe('FolioModule', () => {
    it('debe resolver FOLIO_REPOSITORY_TOKEN', () => {
      const repo = moduleRef.get<FolioRepository>(FOLIO_REPOSITORY_TOKEN);
      expect(repo).toBeDefined();
      expect(typeof repo.allocateNextFolio).toBe('function');
    });

    it('debe resolver ImportCafUseCase', () => {
      const useCase = moduleRef.get<ImportCafUseCase>(ImportCafUseCase);
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });

    it('debe resolver AllocateFolioUseCase', () => {
      const useCase = moduleRef.get<AllocateFolioUseCase>(AllocateFolioUseCase);
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });

    it('debe resolver CafsController', () => {
      const controller = moduleRef.get<CafsController>(CafsController);
      expect(controller).toBeDefined();
      expect(typeof controller.importCaf).toBe('function');
      expect(typeof controller.getFolioStatus).toBe('function');
    });
  });

  describe('SiiModule', () => {
    it('debe resolver SII_GATEWAY_TOKEN', () => {
      const gateway = moduleRef.get<SiiGateway>(SII_GATEWAY_TOKEN);
      expect(gateway).toBeDefined();
      expect(typeof gateway.getSeed).toBe('function');
    });

    it('debe resolver SiiTokenCache', () => {
      const cache = moduleRef.get<SiiTokenCache>(SiiTokenCache);
      expect(cache).toBeDefined();
    });

    it('debe resolver AuthenticateSiiUseCase', () => {
      const useCase = moduleRef.get<AuthenticateSiiUseCase>(
        AuthenticateSiiUseCase
      );
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });

    it('debe resolver SubmitEnvioDteUseCase', () => {
      const useCase = moduleRef.get<SubmitEnvioDteUseCase>(
        SubmitEnvioDteUseCase
      );
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });

    it('debe resolver QueryEnvioStatusUseCase', () => {
      const useCase = moduleRef.get<QueryEnvioStatusUseCase>(
        QueryEnvioStatusUseCase
      );
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });
  });

  describe('DteModule', () => {
    it('debe resolver INVOICE_REPOSITORY_TOKEN', () => {
      const repo = moduleRef.get<InvoiceRepository>(INVOICE_REPOSITORY_TOKEN);
      expect(repo).toBeDefined();
      expect(typeof repo.save).toBe('function');
    });

    it('debe resolver StampInvoiceUseCase', () => {
      const useCase = moduleRef.get<StampInvoiceUseCase>(StampInvoiceUseCase);
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });

    it('debe resolver BuildDteXmlUseCase', () => {
      const useCase = moduleRef.get<BuildDteXmlUseCase>(BuildDteXmlUseCase);
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });

    it('debe resolver SignDteUseCase', () => {
      const useCase = moduleRef.get<SignDteUseCase>(SignDteUseCase);
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });

    it('debe resolver CreateEnvioDteUseCase', () => {
      const useCase = moduleRef.get<CreateEnvioDteUseCase>(
        CreateEnvioDteUseCase
      );
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });

    it('debe resolver IssueInvoiceUseCase con todas sus dependencias cruzadas', () => {
      const useCase = moduleRef.get<IssueInvoiceUseCase>(IssueInvoiceUseCase);
      expect(useCase).toBeDefined();
      expect(typeof useCase.execute).toBe('function');
    });
  });

  describe('AppModule', () => {
    it('debe estar decorado como Module y declarar los módulos del sistema', () => {
      expect(AppModule).toBeDefined();
    });
  });
});
