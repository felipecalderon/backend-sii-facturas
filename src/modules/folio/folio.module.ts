import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CafSchema } from '../../infrastructure/persistence/mongo/schemas/caf.schema.js';
import {
  FOLIO_REPOSITORY_TOKEN,
  FolioRepository
} from '../../domain/folio/ports/folio.repository.js';
import { MongoFolioRepository } from '../../infrastructure/persistence/mongo/mongo-folio.repository.js';
import { ImportCafUseCase } from '../../application/use-cases/import-caf.use-case.js';
import { AllocateFolioUseCase } from '../../application/use-cases/allocate-folio.use-case.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Caf', schema: CafSchema }])],
  providers: [
    {
      provide: FOLIO_REPOSITORY_TOKEN,
      useClass: MongoFolioRepository
    },
    {
      provide: ImportCafUseCase,
      useFactory: (repo: FolioRepository) => new ImportCafUseCase(repo),
      inject: [FOLIO_REPOSITORY_TOKEN]
    },
    {
      provide: AllocateFolioUseCase,
      useFactory: (repo: FolioRepository) => new AllocateFolioUseCase(repo),
      inject: [FOLIO_REPOSITORY_TOKEN]
    }
  ],
  exports: [
    FOLIO_REPOSITORY_TOKEN,
    ImportCafUseCase,
    AllocateFolioUseCase,
    MongooseModule
  ]
})
export class FolioModule {}
