import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validación global de DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Definición OpenAPI
  const config = new DocumentBuilder()
    .setTitle('Motor de Facturación Electrónica SII')
    .setDescription(
      'API REST para la emisión, timbraje, firma y transmisión de Documentos Tributarios Electrónicos (DTE) ante el SII de Chile. ' +
        'Todas las operaciones son multitenant: cada request debe incluir el header `x-tenant-id`.'
    )
    .setVersion('2.0')
    .addServer('http://localhost:3001', 'Desarrollo local')
    .addTag(
      'certificates',
      'Gestión de certificados digitales (.p12) por tenant'
    )
    .addTag('cafs', 'Importación de CAF y consulta de folios disponibles')
    .addTag('invoices', 'Emisión y consulta de estado de facturas electrónicas')
    .addGlobalParameters({
      name: 'x-tenant-id',
      in: 'header',
      required: true,
      description: 'Identificador único del tenant (contribuyente)',
      schema: { type: 'string', example: 'tenant-76123456-0' }
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Exponer spec JSON en /openapi-json (sin Swagger UI) — consumido por Scalar
  SwaggerModule.setup('openapi', app, document, { ui: false, raw: ['json'] });

  // UI moderna de Scalar en /docs
  app.use(
    '/docs',
    apiReference({
      url: '/openapi-json',
      theme: 'default',
      darkMode: true,
      pageTitle: 'SII Facturas — API Reference'
    })
  );

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
