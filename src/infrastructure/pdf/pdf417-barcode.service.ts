import bwipjs from 'bwip-js/node';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';

export interface Pdf417BarcodeOptions {
  eclevel?: number;
  scale?: number;
  rowheight?: number;
  padding?: number;
}

interface Pdf417BwipRenderOptions extends bwipjs.RenderOptions {
  eclevel?: number;
  rowheight?: number;
}

export class Pdf417BarcodeService {
  /**
   * Genera la representación gráfica en imagen PNG del Timbre Electrónico (TED)
   * bajo el estándar bidimensional PDF417 conforme a las normas estrictas del SII Chile:
   * - Modo de codificación binario (Byte Compaction Mode)
   * - Error Correction Level (ECL) = 5
   * - Relación Y:X = 3:1 (rowheight = 3)
   * - Quiet Zone perimetral mínima de 0.25 pulgadas
   * - Formato estándar completo (no truncado)
   */
  public static async generateBarcodePng(
    tedXml: string,
    options?: Pdf417BarcodeOptions
  ): Promise<Buffer> {
    if (!tedXml || !tedXml.includes('<TED') || !tedXml.includes('</TED>')) {
      throw new FiscalValidationError(
        'El contenido a codificar en el timbre PDF417 debe ser un XML <TED> válido'
      );
    }

    const eclevel = options?.eclevel ?? 5;
    const scale = options?.scale ?? 2;
    const rowheight = options?.rowheight ?? 3;
    const padding = options?.padding ?? 12;

    try {
      const renderOptions: Pdf417BwipRenderOptions = {
        bcid: 'pdf417',
        text: tedXml.trim(),
        eclevel,
        rowheight,
        scale,
        paddingwidth: padding,
        paddingheight: padding,
        backgroundcolor: 'ffffff',
        barcolor: '000000'
      };

      // bwip-js/node no expone helpers por simbología en su export por defecto
      // (pdf417 solo existe como named export). La vía estable es toBuffer({ bcid }).
      const pngBuffer = await bwipjs.toBuffer(renderOptions);
      return pngBuffer;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new FiscalValidationError(
        `Error al generar código de barras PDF417 para el timbre electrónico: ${msg}`
      );
    }
  }
}
