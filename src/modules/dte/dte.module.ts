import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvoiceSchema } from '../../infrastructure/persistence/mongo/schemas/invoice.schema.js';
import { CertificateModule } from '../certificate/certificate.module.js';
import { FolioModule } from '../folio/folio.module.js';
import { SiiModule } from '../sii/sii.module.js';
import {
  CERTIFICATE_REPOSITORY_TOKEN,
  CertificateRepository
} from '../../domain/certificate/ports/certificate.repository.js';
import {
  FOLIO_REPOSITORY_TOKEN,
  FolioRepository
} from '../../domain/folio/ports/folio.repository.js';
import {
  INVOICE_REPOSITORY_TOKEN,
  InvoiceRepository
} from '../../domain/dte/ports/invoice.repository.js';
import { MongoInvoiceRepository } from '../../infrastructure/persistence/mongo/mongo-invoice.repository.js';
import { StampInvoiceUseCase } from '../../application/use-cases/stamp-invoice.use-case.js';
import { BuildDteXmlUseCase } from '../../application/use-cases/build-dte-xml.use-case.js';
import { SignDteUseCase } from '../../application/use-cases/sign-dte.use-case.js';
import { CreateEnvioDteUseCase } from '../../application/use-cases/create-envio-dte.use-case.js';
import { SubmitEnvioDteUseCase } from '../../application/use-cases/submit-envio-dte.use-case.js';
import { IssueInvoiceUseCase } from '../../application/use-cases/issue-invoice.use-case.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Invoice', schema: InvoiceSchema }]),
    CertificateModule,
    FolioModule,
    forwardRef(() => SiiModule)
  ],
  providers: [
    {
      provide: INVOICE_REPOSITORY_TOKEN,
      useClass: MongoInvoiceRepository
    },
    {
      provide: StampInvoiceUseCase,
      useFactory: (folioRepo: FolioRepository) =>
        new StampInvoiceUseCase(folioRepo),
      inject: [FOLIO_REPOSITORY_TOKEN]
    },
    {
      provide: BuildDteXmlUseCase,
      useClass: BuildDteXmlUseCase
    },
    {
      provide: SignDteUseCase,
      useFactory: (certRepo: CertificateRepository) =>
        new SignDteUseCase(certRepo),
      inject: [CERTIFICATE_REPOSITORY_TOKEN]
    },
    {
      provide: CreateEnvioDteUseCase,
      useFactory: (certRepo: CertificateRepository) =>
        new CreateEnvioDteUseCase(certRepo),
      inject: [CERTIFICATE_REPOSITORY_TOKEN]
    },
    {
      provide: IssueInvoiceUseCase,
      useFactory: (
        folioRepo: FolioRepository,
        certRepo: CertificateRepository,
        invRepo: InvoiceRepository,
        stampInvoiceUseCase: StampInvoiceUseCase,
        buildDteXmlUseCase: BuildDteXmlUseCase,
        signDteUseCase: SignDteUseCase,
        createEnvioDteUseCase: CreateEnvioDteUseCase,
        submitEnvioDteUseCase: SubmitEnvioDteUseCase
      ) =>
        new IssueInvoiceUseCase(
          folioRepo,
          certRepo,
          invRepo,
          stampInvoiceUseCase,
          buildDteXmlUseCase,
          signDteUseCase,
          createEnvioDteUseCase,
          submitEnvioDteUseCase
        ),
      inject: [
        FOLIO_REPOSITORY_TOKEN,
        CERTIFICATE_REPOSITORY_TOKEN,
        INVOICE_REPOSITORY_TOKEN,
        StampInvoiceUseCase,
        BuildDteXmlUseCase,
        SignDteUseCase,
        CreateEnvioDteUseCase,
        SubmitEnvioDteUseCase
      ]
    }
  ],
  exports: [
    INVOICE_REPOSITORY_TOKEN,
    StampInvoiceUseCase,
    BuildDteXmlUseCase,
    SignDteUseCase,
    CreateEnvioDteUseCase,
    IssueInvoiceUseCase,
    MongooseModule
  ]
})
export class DteModule {}
