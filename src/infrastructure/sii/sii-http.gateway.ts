import { SiiGateway } from '../../domain/sii/ports/sii-gateway.port.js';
import {
  SiiEnvironment,
  SiiSendParams,
  SiiSendResult,
  SiiQueryStatusParams,
  SiiSendStatusResult,
  SiiSendStatusEnum
} from '../../domain/sii/values/sii-domain.types.js';
import {
  SiiAuthenticationError,
  SiiConnectionError,
  SiiSubmissionError
} from '../../domain/sii/errors/sii-domain.error.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import {
  findNonLatin1CodePoint,
  formatUnicodeCodePoint
} from '../xml/xml-encoding.js';
import { DteSigner } from '../crypto/dte-signer.js';
import { EnvioDteBuilder } from '../xml/envio-dte-builder.js';

const describeFetchError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause === undefined) {
    return error.message;
  }

  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  const causeCode =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? cause.code
      : undefined;
  const code = typeof causeCode === 'string' ? `${causeCode}: ` : '';
  return `${error.message}; causa: ${code}${causeMessage}`;
};

const extractXmlTagValue = (
  xml: string,
  tagName: string
): string | undefined => {
  const qualifiedName = `(?:[A-Za-z_][\\w.-]*:)?${tagName}`;
  const unescapedMatch = xml.match(
    new RegExp(`<${qualifiedName}>([\\s\\S]*?)<\\/${qualifiedName}>`, 'i')
  );
  if (unescapedMatch) {
    return unescapedMatch[1].trim();
  }

  const escapedMatch = xml.match(
    new RegExp(
      `&lt;${qualifiedName}&gt;([\\s\\S]*?)&lt;\\/${qualifiedName}&gt;`,
      'i'
    )
  );
  return escapedMatch?.[1].trim();
};

export interface SiiHttpGatewayOptions {
  timeoutMs?: number;
}

export class SiiHttpGateway implements SiiGateway {
  private readonly timeoutMs: number;

  constructor(options?: SiiHttpGatewayOptions) {
    this.timeoutMs = options?.timeoutMs ?? 30000;
  }

  private getBaseUrl(env: SiiEnvironment): string {
    return env === 'CERTIFICATION'
      ? 'https://maullin.sii.cl'
      : 'https://palena.sii.cl';
  }

  public async getSeed(env: SiiEnvironment): Promise<string> {
    const url = `${this.getBaseUrl(env)}/DTEWS/CrSeed.jws`;
    const soapEnvelope =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
      `<SOAP-ENV:Body>` +
      `<getSeed xmlns="http://DefaultNamespace"/>` +
      `</SOAP-ENV:Body>` +
      `</SOAP-ENV:Envelope>`;

    const responseText = await this.postSoap(url, soapEnvelope, 'getSeed');

    // Parsear semilla desde respuesta (puede venir en XML plano o escapado en CDATA/entidades)
    const match =
      responseText.match(/<SEMILLA>(\d+)<\/SEMILLA>/i) ||
      responseText.match(/&lt;SEMILLA&gt;(\d+)&lt;\/SEMILLA&gt;/i);

    if (!match || !match[1]) {
      throw new SiiAuthenticationError(
        `Respuesta del SII no contiene una semilla válida. Respuesta: ${responseText.slice(0, 200)}`
      );
    }

    return match[1];
  }

  public async getToken(
    signedSeedXml: string,
    env: SiiEnvironment
  ): Promise<string> {
    const url = `${this.getBaseUrl(env)}/DTEWS/GetTokenFromSeed.jws`;
    const soapEnvelope =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
      `<SOAP-ENV:Body>` +
      `<getToken xmlns="http://DefaultNamespace">` +
      `<pszXml xsi:type="xsd:string"><![CDATA[${signedSeedXml}]]></pszXml>` +
      `</getToken>` +
      `</SOAP-ENV:Body>` +
      `</SOAP-ENV:Envelope>`;

    const responseText = await this.postSoap(url, soapEnvelope, 'getToken');

    // Parsear token desde respuesta
    const match =
      responseText.match(/<TOKEN>([A-Za-z0-9_-]+)<\/TOKEN>/i) ||
      responseText.match(/&lt;TOKEN&gt;([A-Za-z0-9_-]+)&lt;\/TOKEN&gt;/i);

    if (!match || !match[1]) {
      // Verificar si hay glosa de error
      const glosaMatch =
        responseText.match(/<GLOSA>([\s\S]*?)<\/GLOSA>/i) ||
        responseText.match(/&lt;GLOSA&gt;([\s\S]*?)&lt;\/GLOSA&gt;/i);

      const glosa = glosaMatch ? glosaMatch[1] : responseText.slice(0, 200);
      throw new SiiAuthenticationError(
        `El SII rechazó la solicitud de token: ${glosa}`
      );
    }

    return match[1];
  }

  public async sendDte(params: SiiSendParams): Promise<SiiSendResult> {
    const url = `${this.getBaseUrl(params.env)}/cgi_dte/UPL/DTEUpload`;

    const formData = new FormData();
    formData.append('rutSender', String(params.rutSender.body));
    formData.append('dvSender', String(params.rutSender.dv));
    formData.append('rutCompany', String(params.rutCompany.body));
    formData.append('dvCompany', String(params.rutCompany.dv));

    // Buffer.from(..., 'latin1') truncaría silenciosamente caracteres > U+00FF.
    // Fallar antes de convertir para no enviar bytes distintos al XML firmado.
    const nonLatin1CodePoint = findNonLatin1CodePoint(params.envioDteXml);
    if (nonLatin1CodePoint !== undefined) {
      throw new SiiSubmissionError(
        `El XML del EnvioDTE contiene U+${formatUnicodeCodePoint(nonLatin1CodePoint)}, no representable en ISO-8859-1`
      );
    }

    // El SII exige el archivo codificado en ISO-8859-1 (latin1).
    const xmlBuffer = Buffer.from(params.envioDteXml, 'latin1');
    const transmittedXml = xmlBuffer.toString('latin1');
    if (transmittedXml !== params.envioDteXml) {
      throw new FiscalValidationError(
        'La serialización ISO-8859-1 alteró el XML EnvioDTE antes de transmitirlo'
      );
    }

    if (!params.dteReferenceIds || params.dteReferenceIds.length === 0) {
      throw new FiscalValidationError(
        'El EnvioDTE debe incluir al menos una referencia DTE para validar su firma'
      );
    }
    for (const referenceId of params.dteReferenceIds) {
      if (!DteSigner.verify(transmittedXml, referenceId)) {
        throw new FiscalValidationError(
          `La firma del DTE ${referenceId} no es válida en el XML serializado que se enviará al SII`
        );
      }
    }
    if (!EnvioDteBuilder.verify(transmittedXml)) {
      throw new FiscalValidationError(
        'La firma XMLDSig de SetDTE no es válida en el XML serializado que se enviará al SII'
      );
    }

    const blob = new Blob([xmlBuffer], { type: 'text/xml' });
    formData.append('archivo', blob, 'envio.xml');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Cookie: `TOKEN=${params.token}`,
          'User-Agent':
            'Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0; YComp 5.0.2.4)'
        },
        body: formData,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (err: unknown) {
      throw new SiiConnectionError(
        `Fallo de conexión al enviar DTE a ${url}: ${describeFetchError(err)}`
      );
    }

    const responseText = await response.text();

    const statusMatch = responseText.match(/<STATUS>(\d+)<\/STATUS>/i);
    const trackIdMatch = responseText.match(/<TRACKID>(\d+)<\/TRACKID>/i);
    const status = statusMatch ? statusMatch[1] : undefined;
    const trackId = trackIdMatch ? trackIdMatch[1] : undefined;

    if (status === '0' && trackId) {
      return {
        trackId,
        status,
        rawResponse: responseText
      };
    }

    const detailMatch = responseText.match(/<DETAIL>([\s\S]*?)<\/DETAIL>/i);
    const detail = detailMatch ? detailMatch[1] : responseText.slice(0, 300);

    throw new SiiSubmissionError(
      `El SII rechazó el envío de DTE (STATUS: ${status ?? 'desconocido'}): ${detail}`,
      status,
      responseText
    );
  }

  public async querySendStatus(
    params: SiiQueryStatusParams
  ): Promise<SiiSendStatusResult> {
    const url = `${this.getBaseUrl(params.env)}/DTEWS/QueryEstUp.jws`;
    const soapEnvelope =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
      `<SOAP-ENV:Body>` +
      `<getEstUp xmlns="http://DefaultNamespace">` +
      `<RutCompania xsi:type="xsd:string">${params.rutCompany.body}</RutCompania>` +
      `<DvCompania xsi:type="xsd:string">${params.rutCompany.dv}</DvCompania>` +
      `<TrackId xsi:type="xsd:string">${params.trackId}</TrackId>` +
      `<Token xsi:type="xsd:string">${params.token}</Token>` +
      `</getEstUp>` +
      `</SOAP-ENV:Body>` +
      `</SOAP-ENV:Envelope>`;

    const responseText = await this.postSoap(url, soapEnvelope, 'getEstUp');

    const rawEstado = (
      extractXmlTagValue(responseText, 'ESTADO') ??
      extractXmlTagValue(responseText, 'ESTADO_ENVIO') ??
      'UNKNOWN'
    ).toUpperCase();
    let glosa = extractXmlTagValue(responseText, 'GLOSA');
    const acceptedCount = Number(extractXmlTagValue(responseText, 'ACEPTADOS'));
    const rejectedCount = Number(
      extractXmlTagValue(responseText, 'RECHAZADOS') ??
        extractXmlTagValue(responseText, 'NUM_DOC_RECHAZADOS')
    );
    const hasAcceptedDocuments =
      Number.isFinite(acceptedCount) && acceptedCount > 0;
    const hasRejectedDocuments =
      Number.isFinite(rejectedCount) && rejectedCount > 0;

    let status: SiiSendStatusEnum;
    const hasRejectionIndicator =
      (!!glosa && /rechaz/i.test(glosa)) || /RFR|RECH|RCH/i.test(rawEstado);

    if (hasAcceptedDocuments && hasRejectedDocuments) {
      // El estado del envío no permite asignar un resultado agregado a cada DTE.
      status = 'UNKNOWN';
    } else if (hasRejectedDocuments || hasRejectionIndicator) {
      status = 'RECH';
    } else if (rawEstado === 'EPR') {
      // EPR solo indica que el envío se procesó; no prueba que algún DTE se aceptara.
      status = hasAcceptedDocuments ? 'EPR' : 'UNKNOWN';
    } else if (rawEstado === 'REC') {
      status = 'REC';
    } else {
      status = 'UNKNOWN';
    }

    if (status === 'RECH' && glosa && /^env[ií]o procesado$/i.test(glosa)) {
      // Esta glosa describe el procesamiento del envío, no el motivo del rechazo.
      glosa = undefined;
    }

    return {
      status,
      glosa,
      rawResponse: responseText
    };
  }

  private async postSoap(
    url: string,
    envelope: string,
    action: string
  ): Promise<string> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
          SOAPAction: action
        },
        body: envelope,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (err: unknown) {
      throw new SiiConnectionError(
        `Fallo de conexión SOAP con ${url}: ${describeFetchError(err)}`
      );
    }

    if (!response.ok && response.status !== 500) {
      throw new SiiConnectionError(
        `HTTP ${response.status} en servicio SOAP ${url}: ${response.statusText}`
      );
    }

    return await response.text();
  }
}
