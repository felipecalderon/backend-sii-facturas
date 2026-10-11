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
import {
  findNonLatin1CodePoint,
  formatUnicodeCodePoint
} from '../xml/xml-encoding.js';

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
      const message = err instanceof Error ? err.message : String(err);
      throw new SiiConnectionError(
        `Fallo de conexión al enviar DTE a ${url}: ${message}`
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

    const estadoMatch =
      responseText.match(
        /<ESTADO(?:_ENVIO)?>([A-Za-z0-9_-]+)<\/ESTADO(?:_ENVIO)?>/i
      ) ||
      responseText.match(
        /&lt;ESTADO(?:_ENVIO)?&gt;([A-Za-z0-9_-]+)&lt;\/ESTADO(?:_ENVIO)?&gt;/i
      );

    const glosaMatch =
      responseText.match(/<GLOSA>([\s\S]*?)<\/GLOSA>/i) ||
      responseText.match(/&lt;GLOSA&gt;([\s\S]*?)&lt;\/GLOSA&gt;/i);

    const rawEstado = estadoMatch ? estadoMatch[1].toUpperCase() : 'UNKNOWN';
    const glosa = glosaMatch ? glosaMatch[1].trim() : undefined;

    let status: SiiSendStatusEnum;
    if (rawEstado === 'EPR') {
      status = 'EPR';
    } else if (rawEstado === 'REC') {
      status = 'REC';
    } else if (
      rawEstado === 'RECH' ||
      rawEstado === 'RCH' ||
      rawEstado === 'RFR' ||
      rawEstado.startsWith('R') ||
      (glosa && /rechaz/i.test(glosa))
    ) {
      status = 'RECH';
    } else {
      status = 'UNKNOWN';
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
      const message = err instanceof Error ? err.message : String(err);
      throw new SiiConnectionError(
        `Fallo de conexión SOAP con ${url}: ${message}`
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
