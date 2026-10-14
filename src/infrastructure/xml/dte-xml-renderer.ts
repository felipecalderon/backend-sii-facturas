import { create, fragment } from 'xmlbuilder2';
import { Invoice } from '../../domain/dte/entities/invoice.entity.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import {
  findNonLatin1CodePoint,
  formatUnicodeCodePoint
} from './xml-encoding.js';

export interface RenderDteOptions {
  tmstFirma?: Date;
  includeSignaturePlaceholder?: boolean;
}

export class DteXmlRenderer {
  public static render(invoice: Invoice, options?: RenderDteOptions): string {
    if (!invoice.folio || invoice.folio <= 0) {
      throw new FiscalValidationError(
        'No se puede generar XML DTE sin un folio asignado'
      );
    }
    if (!invoice.tedXml) {
      throw new FiscalValidationError(
        'No se puede generar XML DTE sin un timbre TED timbrado'
      );
    }

    const docId = `F${invoice.folio}T${invoice.tipoDte.code}`;
    const tmstDate =
      options?.tmstFirma ??
      (invoice.fechaEmision.getHours() === 0 &&
      invoice.fechaEmision.getMinutes() === 0
        ? new Date()
        : invoice.fechaEmision);
    const tmstFirmaStr = DteXmlRenderer.formatIsoTimestamp(tmstDate);
    const fchEmisStr = DteXmlRenderer.formatDate(invoice.fechaEmision);

    // 1. Declarar ambos namespaces en DTE para conservar el contexto C14N
    // al integrarlo en EnvioDTE.
    const root = create({ version: '1.0', encoding: 'ISO-8859-1' })
      .ele('http://www.sii.cl/SiiDte', 'DTE', { version: '1.0' })
      .att('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');

    // 2. Nodo Documento con atributo ID obligatorio
    const docEle = root.ele('Documento', { ID: docId });

    // 3. Encabezado
    const encabezado = docEle.ele('Encabezado');

    // 3.1 IdDoc
    encabezado
      .ele('IdDoc')
      .ele('TipoDTE')
      .txt(invoice.tipoDte.code.toString())
      .up()
      .ele('Folio')
      .txt(invoice.folio.toString())
      .up()
      .ele('FchEmis')
      .txt(fchEmisStr)
      .up();

    // 3.2 Emisor (respetando secuencia estricta de DTE_v10.xsd)
    const emisorEle = encabezado.ele('Emisor');
    emisorEle.ele('RUTEmisor').txt(invoice.emisor.rut.toCanonical());
    emisorEle.ele('RznSoc').txt(invoice.emisor.razonSocial);
    emisorEle.ele('GiroEmis').txt(invoice.emisor.giro);
    if (invoice.emisor.telefono) {
      emisorEle.ele('Telefono').txt(invoice.emisor.telefono);
    }
    if (invoice.emisor.correo) {
      emisorEle.ele('CorreoEmisor').txt(invoice.emisor.correo);
    }
    emisorEle.ele('Acteco').txt(invoice.emisor.actividadEconomica.toString());
    emisorEle.ele('DirOrigen').txt(invoice.emisor.direccion);
    emisorEle.ele('CmnaOrigen').txt(invoice.emisor.comuna);
    if (invoice.emisor.ciudad) {
      emisorEle.ele('CiudadOrigen').txt(invoice.emisor.ciudad);
    }

    // 3.3 Receptor (respetando secuencia estricta de DTE_v10.xsd)
    const recepEle = encabezado.ele('Receptor');
    recepEle.ele('RUTRecep').txt(invoice.receptor.rut.toCanonical());
    recepEle.ele('RznSocRecep').txt(invoice.receptor.razonSocial);
    recepEle.ele('GiroRecep').txt(invoice.receptor.giro);
    if (invoice.receptor.contacto) {
      recepEle.ele('Contacto').txt(invoice.receptor.contacto);
    }
    if (invoice.receptor.correo) {
      recepEle.ele('CorreoRecep').txt(invoice.receptor.correo);
    }
    recepEle.ele('DirRecep').txt(invoice.receptor.direccion);
    recepEle.ele('CmnaRecep').txt(invoice.receptor.comuna);
    if (invoice.receptor.ciudad) {
      recepEle.ele('CiudadRecep').txt(invoice.receptor.ciudad);
    }

    // 3.4 Totales
    const totalesEle = encabezado.ele('Totales');
    if (invoice.totales.getNetoClp() > 0) {
      totalesEle.ele('MntNeto').txt(invoice.totales.getNetoClp().toString());
    }
    if (invoice.totales.getExentoClp() > 0) {
      totalesEle.ele('MntExe').txt(invoice.totales.getExentoClp().toString());
    }
    if (invoice.totales.getNetoClp() > 0) {
      totalesEle.ele('TasaIVA').txt(invoice.totales.tasaIva.toString());
      totalesEle.ele('IVA').txt(invoice.totales.getIvaClp().toString());
    }
    totalesEle.ele('MntTotal').txt(invoice.totales.getTotalClp().toString());

    // 4. Detalle
    for (const item of invoice.items) {
      const detEle = docEle.ele('Detalle');
      detEle.ele('NroLinDet').txt(item.linea.toString());

      if (item.esExento) {
        detEle.ele('IndExe').txt('1');
      }

      detEle.ele('NmbItem').txt(item.nombre);

      if (item.descripcion) {
        detEle.ele('DscItem').txt(item.descripcion);
      }

      const qtyScaled = item.cantidad.getRawScaledAmount();
      const qtyStr =
        qtyScaled % 1000000n === 0n
          ? (qtyScaled / 1000000n).toString()
          : item.cantidad.toDecimalString(2);
      detEle.ele('QtyItem').txt(qtyStr);

      detEle.ele('PrcItem').txt(item.precioUnitario.toClpInteger().toString());

      if (item.descuentoPct !== undefined && item.descuentoPct > 0) {
        detEle.ele('DescuentoPct').txt(item.descuentoPct.toString());
      }
      if (!item.descuentoMonto.isZero()) {
        detEle
          .ele('DescuentoMonto')
          .txt(item.descuentoMonto.toClpInteger().toString());
      }

      detEle.ele('MontoItem').txt(item.getMontoItemClp().toString());
    }

    // 5. Incrustar el nodo TED intacto
    docEle.import(fragment(invoice.tedXml));

    // 6. Timestamp de firma
    docEle.ele('TmstFirma').txt(tmstFirmaStr);

    // 7. Firma XMLDSig (Placeholder estructural para validación de esquema XSD previo a M4)
    if (options?.includeSignaturePlaceholder !== false) {
      const sigEle = root.ele(
        'http://www.w3.org/2000/09/xmldsig#',
        'Signature'
      );
      const signedInfo = sigEle.ele('SignedInfo');
      signedInfo.ele('CanonicalizationMethod', {
        Algorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
      });
      signedInfo.ele('SignatureMethod', {
        Algorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
      });
      const refEle = signedInfo.ele('Reference', { URI: `#${docId}` });
      refEle.ele('Transforms').ele('Transform', {
        Algorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
      });
      refEle.ele('DigestMethod', {
        Algorithm: 'http://www.w3.org/2000/09/xmldsig#sha1'
      });
      refEle.ele('DigestValue').txt('AAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      sigEle
        .ele('SignatureValue')
        .txt(
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
        );
      const keyInfo = sigEle.ele('KeyInfo');
      const rsaKey = keyInfo.ele('KeyValue').ele('RSAKeyValue');
      rsaKey.ele('Modulus').txt('AQAB');
      rsaKey.ele('Exponent').txt('AQAB');
      const x509Data = keyInfo.ele('X509Data');
      x509Data
        .ele('X509Certificate')
        .txt(
          'MIIEgjCCA+ugAwIBAgIEAQAApzANBgkqhkiG9w0BAQUFADCBtTELMAkGA1UEBhMC'
        );
    }

    const xml = root.end({ prettyPrint: true });
    const nonLatin1CodePoint = findNonLatin1CodePoint(xml);
    if (nonLatin1CodePoint !== undefined) {
      throw new FiscalValidationError(
        `El XML DTE contiene U+${formatUnicodeCodePoint(nonLatin1CodePoint)}, no representable en ISO-8859-1`
      );
    }

    return xml;
  }

  private static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private static formatIsoTimestamp(date: Date): string {
    const dateStr = DteXmlRenderer.formatDate(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${dateStr}T${hours}:${minutes}:${seconds}`;
  }
}
