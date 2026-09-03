import { Rut } from '../../domain/shared/rut.vo.js';
import { TipoDte } from '../../domain/dte/values/dte-type.vo.js';
import { InvalidCafXmlError } from '../../domain/folio/errors/folio-domain.error.js';

export interface ParsedCafData {
  rutEmisor: Rut;
  razonSocial: string;
  tipoDte: TipoDte;
  rangoDesde: number;
  rangoHasta: number;
  fechaAutorizacion: Date;
  clavePrivadaPem: string;
  cafXml: string;
  idClave?: number;
}

export class CafXmlParser {
  public static parse(xmlContent: string): ParsedCafData {
    if (!xmlContent || typeof xmlContent !== 'string') {
      throw new InvalidCafXmlError(
        'El contenido XML está vacío o no es una cadena de texto'
      );
    }

    // 1. Extraer el fragmento verbatim <CAF>...</CAF>
    const cafMatch = xmlContent.match(/<CAF[\s\S]*?<\/CAF>/i);
    if (!cafMatch) {
      throw new InvalidCafXmlError(
        'No se encontró el nodo <CAF> en el documento XML'
      );
    }
    const cafXml = cafMatch[0].trim();

    // 2. Extraer la clave privada <RSASK>...</RSASK>
    const rsaskMatch = xmlContent.match(/<RSASK>([\s\S]*?)<\/RSASK>/i);
    if (!rsaskMatch) {
      throw new InvalidCafXmlError(
        'No se encontró el nodo de clave privada <RSASK> en el documento XML'
      );
    }
    const rawPrivateKey = rsaskMatch[1].trim();
    const clavePrivadaPem = CafXmlParser.normalizePem(rawPrivateKey);

    // 3. Extraer campos dentro del nodo <DA>
    const reMatch = cafXml.match(/<RE>([\s\S]*?)<\/RE>/i);
    if (!reMatch) {
      throw new InvalidCafXmlError(
        'No se encontró el RUT del emisor <RE> en el CAF'
      );
    }
    const rutEmisor = Rut.of(reMatch[1].trim());

    const rsMatch = cafXml.match(/<RS>([\s\S]*?)<\/RS>/i);
    const razonSocial = rsMatch ? rsMatch[1].trim() : '';

    const tdMatch = cafXml.match(/<TD>([\s\S]*?)<\/TD>/i);
    if (!tdMatch) {
      throw new InvalidCafXmlError(
        'No se encontró el tipo de DTE <TD> en el CAF'
      );
    }
    const tipoDte = TipoDte.of(parseInt(tdMatch[1].trim(), 10));

    const dMatch = cafXml.match(/<D>([\s\S]*?)<\/D>/i);
    const hMatch = cafXml.match(/<H>([\s\S]*?)<\/H>/i);
    if (!dMatch || !hMatch) {
      throw new InvalidCafXmlError(
        'No se encontró el rango de folios <RNG> (<D> y <H>) en el CAF'
      );
    }
    const rangoDesde = parseInt(dMatch[1].trim(), 10);
    const rangoHasta = parseInt(hMatch[1].trim(), 10);

    if (
      isNaN(rangoDesde) ||
      isNaN(rangoHasta) ||
      rangoDesde <= 0 ||
      rangoHasta <= 0
    ) {
      throw new InvalidCafXmlError(
        `Valores de rango de folios no válidos: [${dMatch[1]}, ${hMatch[1]}]`
      );
    }
    if (rangoDesde > rangoHasta) {
      throw new InvalidCafXmlError(
        `Rango inconsistente: desde (${rangoDesde}) es mayor que hasta (${rangoHasta})`
      );
    }

    const faMatch = cafXml.match(/<FA>([\s\S]*?)<\/FA>/i);
    if (!faMatch) {
      throw new InvalidCafXmlError(
        'No se encontró la fecha de autorización <FA> en el CAF'
      );
    }
    const fechaAutorizacion = new Date(faMatch[1].trim());
    if (isNaN(fechaAutorizacion.getTime())) {
      throw new InvalidCafXmlError(
        `Fecha de autorización <FA> inválida: "${faMatch[1]}"`
      );
    }

    const idkMatch = cafXml.match(/<IDK>([\s\S]*?)<\/IDK>/i);
    const idClave = idkMatch ? parseInt(idkMatch[1].trim(), 10) : undefined;

    return {
      rutEmisor,
      razonSocial,
      tipoDte,
      rangoDesde,
      rangoHasta,
      fechaAutorizacion,
      clavePrivadaPem,
      cafXml,
      idClave
    };
  }

  private static normalizePem(rawKey: string): string {
    const trimmed = rawKey.trim();
    if (trimmed.includes('-----BEGIN RSA PRIVATE KEY-----')) {
      return trimmed;
    }
    // Si viene solo el base64 sin cabeceras PEM
    return `-----BEGIN RSA PRIVATE KEY-----\n${trimmed}\n-----END RSA PRIVATE KEY-----`;
  }
}
