import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { XsdValidator } from './xsd-validator.js';

describe('XsdValidator', () => {
  // El ejemplo oficial abrevia algunos valores Base64; aquí solo se valida XSD.
  const readSanitizedExampleXml = (): string =>
    fs
      .readFileSync(path.resolve(process.cwd(), 'DTE33-ejemplo.xml'), 'utf-8')
      .replace(
        /<(SignatureValue|Modulus|Exponent|X509Certificate)>([\s\S]*?)<\/\1>/g,
        (element, name: string, value: string) => {
          const base64 = value.replace(/\s+/g, '');
          const isValidBase64 =
            /^[A-Za-z0-9+/]*={0,2}$/.test(base64) && base64.length % 4 === 0;

          return isValidBase64 ? element : `<${name}>AA==</${name}>`;
        }
      );

  it('debe validar exitosamente un nodo <DTE> extraído del ejemplo oficial del SII', async () => {
    const ejemploXml = readSanitizedExampleXml();

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
    const envioXml = readSanitizedExampleXml();

    const result = await XsdValidator.validateEnvioDte(envioXml);
    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('debe rechazar como EnvioDTE un <DTE> suelto sin sobre, aunque el DTE sea válido', async () => {
    const ejemploXml = readSanitizedExampleXml();

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
