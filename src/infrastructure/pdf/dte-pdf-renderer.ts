import { renderToBuffer } from '@react-pdf/renderer';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { Money } from '../../domain/shared/money.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import { Pdf417BarcodeService } from './pdf417-barcode.service.js';
import { styles } from './dte-pdf-style.js';

interface PdfNode {
  $$typeof: symbol;
  type: string;
  key: null;
  props: Record<string, unknown>;
}

/**
 * React 19 identifica los elementos con este símbolo global. El árbol debe
 * estar compuesto por elementos React válidos porque @react-pdf/renderer lo
 * procesa con el reconciliador de React; no se importa `react` directamente
 * porque no es una dependencia declarada del backend.
 */
const REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element');

function h(
  type: string,
  props: Record<string, unknown> = {},
  ...children: unknown[]
): PdfNode {
  const flatChildren = children
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false);

  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key: null,
    props: {
      ...props,
      children: flatChildren.length === 1 ? flatChildren[0] : flatChildren
    }
  };
}

export interface RenderDtePdfOptions {
  invoice: Invoice;
  barcodePngBuffer?: Buffer;
}

export class DtePdfRenderer {
  /**
   * Genera el documento PDF oficial del DTE bajo las especificaciones gráficas del SII Chile.
   */
  public static async renderToBuffer(
    options: RenderDtePdfOptions
  ): Promise<Buffer> {
    const { invoice } = options;

    if (!invoice.folio || invoice.folio <= 0) {
      throw new FiscalValidationError(
        'No se puede generar PDF de un DTE sin un folio asignado'
      );
    }

    if (!invoice.tedXml) {
      throw new FiscalValidationError(
        'No se puede generar PDF de un DTE sin timbre electrónico (TED)'
      );
    }

    // 1. Obtener o generar código de barras PDF417 normativo
    const barcodePng =
      options.barcodePngBuffer ??
      (await Pdf417BarcodeService.generateBarcodePng(invoice.tedXml));

    // 2. Formatear valores y etiquetas
    const emisor = invoice.emisor;
    const receptor = invoice.receptor;
    const totales = invoice.totales;
    const fchResol = emisor.fchResol ?? '2026-01-01';
    const nroResol = emisor.nroResol ?? 0;
    const tipoDteNombre =
      invoice.tipoDte.code === 33
        ? 'FACTURA ELECTRÓNICA'
        : invoice.tipoDte.code === 34
          ? 'FACTURA NO AFECTA O EXENTA ELECTRÓNICA'
          : invoice.tipoDte.code === 52
            ? 'GUÍA DE DESPACHO ELECTRÓNICA'
            : invoice.tipoDte.code === 56
              ? 'NOTA DE DÉBITO ELECTRÓNICA'
              : invoice.tipoDte.code === 61
                ? 'NOTA DE CRÉDITO ELECTRÓNICA'
                : `DOCUMENTO TRIBUTARIO ELECTRÓNICO (DTE ${invoice.tipoDte.code})`;

    const fechaEmisionStr = DtePdfRenderer.formatDateChile(
      invoice.fechaEmision
    );
    const folioStr = String(invoice.folio).padStart(6, '0');
    const siiUnidad = (emisor.ciudad ?? emisor.comuna).toUpperCase();

    // 4. Armar el árbol de nodos
    const doc = h(
      'DOCUMENT',
      { title: `DTE-${invoice.tipoDte.code}-${invoice.folio}` },
      h(
        'PAGE',
        { size: 'LETTER', style: styles.page },
        // Fila Encabezado
        h(
          'VIEW',
          { style: styles.headerRow },
          h(
            'VIEW',
            { style: styles.issuerCol },
            h('TEXT', { style: styles.issuerName }, emisor.razonSocial),
            h('TEXT', { style: styles.issuerGiro }, `GIRO: ${emisor.giro}`),
            h(
              'TEXT',
              { style: styles.issuerText },
              `Casa Matriz: ${emisor.direccion}, ${emisor.comuna}${emisor.ciudad ? ` - ${emisor.ciudad}` : ''}`
            ),
            emisor.telefono
              ? h(
                  'TEXT',
                  { style: styles.issuerText },
                  `Fono: ${emisor.telefono}`
                )
              : null,
            emisor.correo
              ? h(
                  'TEXT',
                  { style: styles.issuerText },
                  `Email: ${emisor.correo}`
                )
              : null,
            h(
              'TEXT',
              { style: styles.issuerText },
              `Actividad Económica (ACTECO): ${emisor.actividadEconomica}`
            )
          ),
          h(
            'VIEW',
            { style: styles.siiBox },
            h(
              'TEXT',
              { style: styles.siiRut },
              `R.U.T.: ${emisor.rut.toCanonical()}`
            ),
            h('TEXT', { style: styles.siiTipoDoc }, tipoDteNombre),
            h('TEXT', { style: styles.siiFolio }, `N° ${folioStr}`),
            h('TEXT', { style: styles.siiUnidadText }, `S.I.I. - ${siiUnidad}`)
          )
        ),
        // Fila Datos del Receptor
        h(
          'VIEW',
          { style: styles.receiverBox },
          h(
            'VIEW',
            { style: styles.dataRow },
            h(
              'VIEW',
              { style: styles.colHalf },
              h('TEXT', { style: styles.label }, 'FECHA EMISIÓN:'),
              h('TEXT', { style: styles.value }, fechaEmisionStr)
            ),
            h(
              'VIEW',
              { style: styles.colHalf },
              h('TEXT', { style: styles.label }, 'CIUDAD:'),
              h(
                'TEXT',
                { style: styles.value },
                receptor.ciudad ?? receptor.comuna
              )
            )
          ),
          h(
            'VIEW',
            { style: styles.dataRow },
            h(
              'VIEW',
              { style: styles.colHalf },
              h('TEXT', { style: styles.label }, 'SEÑOR(ES):'),
              h('TEXT', { style: styles.value }, receptor.razonSocial)
            ),
            h(
              'VIEW',
              { style: styles.colHalf },
              h('TEXT', { style: styles.label }, 'R.U.T.:'),
              h('TEXT', { style: styles.value }, receptor.rut.toCanonical())
            )
          ),
          h(
            'VIEW',
            { style: styles.dataRow },
            h(
              'VIEW',
              { style: styles.colHalf },
              h('TEXT', { style: styles.label }, 'GIRO:'),
              h('TEXT', { style: styles.value }, receptor.giro)
            ),
            receptor.contacto
              ? h(
                  'VIEW',
                  { style: styles.colHalf },
                  h('TEXT', { style: styles.label }, 'CONTACTO:'),
                  h('TEXT', { style: styles.value }, receptor.contacto)
                )
              : null
          ),
          h(
            'VIEW',
            { style: styles.dataRow },
            h(
              'VIEW',
              { style: styles.colHalf },
              h('TEXT', { style: styles.label }, 'DIRECCIÓN:'),
              h('TEXT', { style: styles.value }, receptor.direccion)
            ),
            h(
              'VIEW',
              { style: styles.colHalf },
              h('TEXT', { style: styles.label }, 'COMUNA:'),
              h('TEXT', { style: styles.value }, receptor.comuna)
            )
          )
        ),
        // Tabla de ítems
        h(
          'VIEW',
          { style: styles.tableHeader },
          h('TEXT', { style: styles.colItemNum }, '#'),
          h('TEXT', { style: styles.colItemDesc }, 'DESCRIPCIÓN'),
          h('TEXT', { style: styles.colItemQty }, 'CANT.'),
          h('TEXT', { style: styles.colItemPrice }, 'P. UNITARIO'),
          h('TEXT', { style: styles.colItemTotal }, 'TOTAL')
        ),
        ...invoice.items.map((item, idx) =>
          h(
            'VIEW',
            { style: styles.tableRow },
            h('TEXT', { style: styles.colItemNum }, String(idx + 1)),
            h(
              'TEXT',
              { style: styles.colItemDesc },
              item.nombre + (item.descripcion ? ` - ${item.descripcion}` : '')
            ),
            h(
              'TEXT',
              { style: styles.colItemQty },
              DtePdfRenderer.formatQuantity(item.cantidad)
            ),
            h(
              'TEXT',
              { style: styles.colItemPrice },
              DtePdfRenderer.formatCurrency(item.precioUnitario.toClpInteger())
            ),
            h(
              'TEXT',
              { style: styles.colItemTotal },
              DtePdfRenderer.formatCurrency(item.getMontoItemClp())
            )
          )
        ),
        // Pie: Timbre Electrónico y Totales
        h(
          'VIEW',
          { style: styles.footerRow },
          h(
            'VIEW',
            { style: styles.timbreCol },
            h('IMAGE', { src: barcodePng, style: styles.barcodeImg }),
            h('TEXT', { style: styles.timbreTitle }, 'Timbre Electrónico SII'),
            h(
              'TEXT',
              { style: styles.timbreSub },
              `Res. ${nroResol} de ${fchResol} - Verifique documento: www.sii.cl`
            )
          ),
          h(
            'VIEW',
            { style: styles.totalsCol },
            totales.montoNeto.toClpInteger() > 0
              ? h(
                  'VIEW',
                  { style: styles.totalRow },
                  h('TEXT', { style: styles.label }, 'MONTO NETO:'),
                  h(
                    'TEXT',
                    { style: styles.value },
                    DtePdfRenderer.formatCurrency(
                      totales.montoNeto.toClpInteger()
                    )
                  )
                )
              : null,
            totales.montoExento.toClpInteger() > 0
              ? h(
                  'VIEW',
                  { style: styles.totalRow },
                  h('TEXT', { style: styles.label }, 'MONTO EXENTO:'),
                  h(
                    'TEXT',
                    { style: styles.value },
                    DtePdfRenderer.formatCurrency(
                      totales.montoExento.toClpInteger()
                    )
                  )
                )
              : null,
            totales.montoIva.toClpInteger() > 0
              ? h(
                  'VIEW',
                  { style: styles.totalRow },
                  h(
                    'TEXT',
                    { style: styles.label },
                    `I.V.A. (${totales.tasaIva}%):`
                  ),
                  h(
                    'TEXT',
                    { style: styles.value },
                    DtePdfRenderer.formatCurrency(
                      totales.montoIva.toClpInteger()
                    )
                  )
                )
              : null,
            h(
              'VIEW',
              { style: styles.totalGrandRow },
              h('TEXT', { style: styles.totalGrandText }, 'TOTAL:'),
              h(
                'TEXT',
                { style: styles.totalGrandText },
                DtePdfRenderer.formatCurrency(totales.montoTotal.toClpInteger())
              )
            )
          )
        ),
        // Sección Acuse de Recibo Ley 19.983
        h(
          'VIEW',
          { style: styles.cedibleBox },
          h(
            'TEXT',
            { style: styles.cedibleTitle },
            'ACUSE DE RECIBO (Ley 19.983)'
          ),
          h(
            'TEXT',
            { style: styles.cedibleFields },
            'NOMBRE: ___________________________ RUT: ______________ FIRMA: ____________ FECHA: ___________ RECINTO: ___________'
          ),
          h(
            'TEXT',
            { style: styles.cedibleLegend },
            'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4° y la letra c) del Art. 5° de la Ley 19.983, acredita que la entrega de mercaderías o servicio(s) prestado(s) ha(n) sido recibido(s).'
          )
        )
      )
    );

    return renderToBuffer(doc as never);
  }

  private static formatCurrency(value: number): string {
    return '$ ' + value.toLocaleString('es-CL');
  }

  private static formatQuantity(cantidad: Money): string {
    const raw = cantidad.getRawScaledAmount();
    if (raw % 1_000_000n === 0n) {
      return (raw / 1_000_000n).toString();
    }
    return cantidad.toDecimalString(2);
  }

  private static formatDateChile(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}
