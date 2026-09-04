import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CertificateModule } from './modules/certificate/certificate.module.js';
import { FolioModule } from './modules/folio/folio.module.js';
import { SiiModule } from './modules/sii/sii.module.js';
import { DteModule } from './modules/dte/dte.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGODB_URI') ??
          'mongodb://localhost:27017/facturacion-sii'
      })
    }),
    CertificateModule,
    FolioModule,
    SiiModule,
    DteModule
  ],
  controllers: [],
  providers: []
})
export class AppModule {}
