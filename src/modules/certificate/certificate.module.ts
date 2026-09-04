import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CertificateSchema } from '../../infrastructure/persistence/mongo/schemas/certificate.schema.js';
import {
  CERTIFICATE_REPOSITORY_TOKEN,
  CertificateRepository
} from '../../domain/certificate/ports/certificate.repository.js';
import { MongoCertificateRepository } from '../../infrastructure/persistence/mongo/mongo-certificate.repository.js';
import { EncryptionService } from '../../infrastructure/security/encryption.service.js';
import { UploadCertificateUseCase } from '../../application/use-cases/upload-certificate.use-case.js';
import { CertificatesController } from './certificates.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Certificate', schema: CertificateSchema }
    ])
  ],
  controllers: [CertificatesController],
  providers: [
    EncryptionService,
    {
      provide: CERTIFICATE_REPOSITORY_TOKEN,
      useClass: MongoCertificateRepository
    },
    {
      provide: UploadCertificateUseCase,
      useFactory: (
        repo: CertificateRepository,
        encryptionService: EncryptionService
      ) => new UploadCertificateUseCase(repo, encryptionService),
      inject: [CERTIFICATE_REPOSITORY_TOKEN, EncryptionService]
    }
  ],
  exports: [
    CERTIFICATE_REPOSITORY_TOKEN,
    EncryptionService,
    UploadCertificateUseCase,
    MongooseModule
  ]
})
export class CertificateModule {}
