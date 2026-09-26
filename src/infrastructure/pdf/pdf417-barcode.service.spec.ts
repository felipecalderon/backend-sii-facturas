import { describe, it, expect } from 'vitest';
import { Pdf417BarcodeService } from './pdf417-barcode.service.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

describe('Pdf417BarcodeService', () => {
  const sampleTedXml = `
    <TED version="1.0">
      <DD>
        <RE>76123456-0</RE>
        <TD>33</TD>
        <F>122</F>
        <FE>2026-09-26</FE>
        <RR>55555555-5</RR>
        <RSR>Cliente de Prueba SpA</RSR>
        <MNT>119000</MNT>
        <IT1>Servicio de Consultoria</IT1>
        <CAF version="1.0">
          <DA><RE>76123456-0</RE><RS>Emisor</RS><TD>33</TD><RNG><D>1</D><H>500</H></RNG><FA>2026-09-01</FA><RSAPK><M>AQAB</M><E>AQAB</E></RSAPK><IDK>3</IDK></DA>
          <FRMA>firmaBase64</FRMA>
        </CAF>
        <TSTED>2026-09-26T12:00:00</TSTED>
      </DD>
      <FRMT algoritmo="SHA1withRSA">firmaTedBase64...</FRMT>
    </TED>
  `.trim();

  it('debe generar exitosamente un buffer PNG con los magic bytes de PNG (0x89, P, N, G)', async () => {
    const pngBuffer =
      await Pdf417BarcodeService.generateBarcodePng(sampleTedXml);

    expect(pngBuffer).toBeInstanceOf(Buffer);
    expect(pngBuffer.length).toBeGreaterThan(100);

    // Magic bytes de formato PNG: 0x89 0x50 0x4E 0x47
    expect(pngBuffer[0]).toBe(0x89);
    expect(pngBuffer[1]).toBe(0x50); // 'P'
    expect(pngBuffer[2]).toBe(0x4e); // 'N'
    expect(pngBuffer[3]).toBe(0x47); // 'G'
  });

  it('debe lanzar FiscalValidationError si el XML no contiene etiquetas TED', async () => {
    await expect(
      Pdf417BarcodeService.generateBarcodePng('<INVALID>sin ted</INVALID>')
    ).rejects.toThrow(FiscalValidationError);
  });

  it('debe respetar las opciones personalizadas de padding y escala', async () => {
    const pngNormal = await Pdf417BarcodeService.generateBarcodePng(
      sampleTedXml,
      { scale: 1 }
    );
    const pngScaled = await Pdf417BarcodeService.generateBarcodePng(
      sampleTedXml,
      { scale: 3 }
    );

    expect(pngScaled.length).toBeGreaterThan(pngNormal.length);
  });
});
