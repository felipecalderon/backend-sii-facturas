import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { XsdValidator } from './xsd-validator.js';

describe('XsdValidator', () => {
  // El fixture usa valores Base64 de prueba en X509Certificate; aquí solo se valida XSD.
  it('debe validar exitosamente un nodo <DTE> extraído del ejemplo oficial del SII', async () => {
    const ejemploXml = fs.readFileSync(
      path.resolve(process.cwd(), 'docs/schemas-sii/F60T33-ejemplo.xml'),
      'utf-8'
    );

    // Extraer el fragmento <DTE>...</DTE> del ejemplo
    const dteMatch = ejemploXml.match(/<DTE[\s\S]*?<\/DTE>/);
    expect(dteMatch).toBeDefined();

    const dteXml = `<?xml version="1.0" encoding="ISO-8859-1"?>\n<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">\n${dteMatch![0].replace(/<DTE[^>]*>|<\/DTE>/g, '')}\n</DTE>`;

    const result = await XsdValidator.validateDte(dteXml);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('debe detectar y reportar errores de esquema en un XML con estructura inválida', async () => {
    const invalidXml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
  <Documento ID="F1T33">
    <Encabezado>
      <IdDoc>
        <TipoDTE>999</TipoDTE>
      </IdDoc>
    </Encabezado>
  </Documento>
</DTE>`;

    const result = await XsdValidator.validateDte(invalidXml);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('debe validar exitosamente el sobre <EnvioDTE> del ejemplo oficial del SII', async () => {
    const envioXml = fs.readFileSync(
      path.resolve(process.cwd(), 'docs/schemas-sii/F60T33-ejemplo.xml'),
      'utf-8'
    );

    const result = await XsdValidator.validateEnvioDte(envioXml);
    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('debe rechazar como EnvioDTE un <DTE> suelto sin sobre, aunque el DTE sea válido', async () => {
    const ejemploXml = fs.readFileSync(
      path.resolve(process.cwd(), 'docs/schemas-sii/F60T33-ejemplo.xml'),
      'utf-8'
    );

    // Extraer el fragmento <DTE>...</DTE> del ejemplo (documento válido por sí solo)
    const dteMatch = ejemploXml.match(/<DTE[\s\S]*?<\/DTE>/);
    expect(dteMatch).toBeDefined();

    const dteXml = `<?xml version="1.0" encoding="ISO-8859-1"?>\n<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">\n${dteMatch![0].replace(/<DTE[^>]*>|<\/DTE>/g, '')}\n</DTE>`;

    // El DTE suelto es válido contra DTE_v10.xsd, pero no contra EnvioDTE_v10.xsd
    const comoDte = await XsdValidator.validateDte(dteXml);
    expect(comoDte.isValid).toBe(true);

    const comoEnvio = await XsdValidator.validateEnvioDte(dteXml);
    expect(comoEnvio.isValid).toBe(false);
    expect(comoEnvio.errors).toContain('El elemento raíz debe ser <EnvioDTE>.');
  });
});
