import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SiiHttpGateway } from './sii-http.gateway.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import { FiscalValidationError } from '../../domain/dte/errors/fiscal-domain.error.js';
import {
  SiiAuthenticationError,
  SiiConnectionError,
  SiiSubmissionError
} from '../../domain/sii/errors/sii-domain.error.js';
import { DteSigner } from '../crypto/dte-signer.js';
import { EnvioDteBuilder } from '../xml/envio-dte-builder.js';

describe('SiiHttpGateway', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(DteSigner, 'verify').mockReturnValue(true);
    vi.spyOn(EnvioDteBuilder, 'verify').mockReturnValue(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('debe obtener la semilla correctamente desde maullin en CERTIFICATION', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      expect(url).toBe('https://maullin.sii.cl/DTEWS/CrSeed.jws');
      return new Response(
        `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
          <SOAP-ENV:Body>
            <getSeedResponse>
              <getSeedReturn>&lt;?xml version="1.0"?&gt;&lt;RESP_BODY&gt;&lt;SEMILLA&gt;000000000042&lt;/SEMILLA&gt;&lt;ESTADO&gt;00&lt;/ESTADO&gt;&lt;/RESP_BODY&gt;</getSeedReturn>
            </getSeedResponse>
          </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`,
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    });

    const gateway = new SiiHttpGateway();
    const seed = await gateway.getSeed('CERTIFICATION');

    expect(seed).toBe('000000000042');
  });

  it('debe obtener el token correctamente tras enviar la semilla firmada', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      expect(url).toBe('https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws');
      return new Response(
        `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
          <SOAP-ENV:Body>
            <getTokenResponse>
              <getTokenReturn>&lt;?xml version="1.0"?&gt;&lt;RESP_BODY&gt;&lt;TOKEN&gt;ABCDEF1234567890&lt;/TOKEN&gt;&lt;ESTADO&gt;00&lt;/ESTADO&gt;&lt;/RESP_BODY&gt;</getTokenReturn>
            </getTokenResponse>
          </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`,
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      );
    });

    const gateway = new SiiHttpGateway();
    const token = await gateway.getToken(
      '<getToken></getToken>',
      'CERTIFICATION'
    );

    expect(token).toBe('ABCDEF1234567890');
  });

  it('debe lanzar SiiAuthenticationError si la respuesta de token no contiene token válido', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          `<RESP_BODY><ESTADO>02</ESTADO><GLOSA>Certificado Revocado</GLOSA></RESP_BODY>`,
          { status: 200 }
        )
      );

    const gateway = new SiiHttpGateway();
    await expect(gateway.getToken('<signed>', 'CERTIFICATION')).rejects.toThrow(
      SiiAuthenticationError
    );
  });

  it('debe enviar el DTE mediante POST multipart con cookie TOKEN y recibir TrackID', async () => {
    let capturedHeaders: Headers | undefined;
    let capturedBody: any;

    globalThis.fetch = vi
      .fn()
      .mockImplementation(async (url: string, init: any) => {
        expect(url).toBe('https://maullin.sii.cl/cgi_dte/UPL/DTEUpload');
        capturedHeaders = init.headers;
        capturedBody = init.body;

        return new Response(
          `<RECEPCIONDTE>
          <RUTSENDER>15123456</RUTSENDER>
          <RUTCOMPANY>76123456</RUTCOMPANY>
          <STATUS>0</STATUS>
          <TRACKID>8877665544</TRACKID>
        </RECEPCIONDTE>`,
          { status: 200 }
        );
      });

    const envioDteXml =
      '<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE>Purén</EnvioDTE>';
    const gateway = new SiiHttpGateway();
    const result = await gateway.sendDte({
      env: 'CERTIFICATION',
      token: 'SESSION_TOKEN_123',
      rutSender: Rut.of('15123456-9'),
      rutCompany: Rut.of('76123456-0'),
      envioDteXml,
      dteReferenceIds: ['F55T33']
    });

    expect(result.trackId).toBe('8877665544');
    expect(result.status).toBe('0');
    expect((capturedHeaders as any).Cookie).toBe('TOKEN=SESSION_TOKEN_123');
    expect((capturedHeaders as any)['User-Agent']).toBe(
      'Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0; YComp 5.0.2.4)'
    );
    expect((capturedHeaders as any)['Content-Type']).toBeUndefined();
    expect(capturedBody).toBeInstanceOf(FormData);

    const uploadedFile = (capturedBody as FormData).get('archivo') as Blob;
    expect(uploadedFile).toBeInstanceOf(Blob);
    const uploadedXml = Buffer.from(await uploadedFile.arrayBuffer()).toString(
      'latin1'
    );
    expect(uploadedXml).toBe(envioDteXml);
    expect(DteSigner.verify).toHaveBeenCalledWith(envioDteXml, 'F55T33');
    expect(EnvioDteBuilder.verify).toHaveBeenCalledWith(envioDteXml);
  });

  it('debe bloquear el POST si falla la firma del DTE en el XML serializado', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    vi.mocked(DteSigner.verify).mockReturnValue(false);

    const gateway = new SiiHttpGateway();
    await expect(
      gateway.sendDte({
        env: 'CERTIFICATION',
        token: 'SESSION_TOKEN_123',
        rutSender: Rut.of('15123456-9'),
        rutCompany: Rut.of('76123456-0'),
        envioDteXml: '<EnvioDTE>Purén</EnvioDTE>',
        dteReferenceIds: ['F55T33']
      })
    ).rejects.toThrow(FiscalValidationError);

    expect(EnvioDteBuilder.verify).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debe bloquear el POST si falla la firma de SetDTE en el XML serializado', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    vi.mocked(EnvioDteBuilder.verify).mockReturnValue(false);

    const gateway = new SiiHttpGateway();
    await expect(
      gateway.sendDte({
        env: 'CERTIFICATION',
        token: 'SESSION_TOKEN_123',
        rutSender: Rut.of('15123456-9'),
        rutCompany: Rut.of('76123456-0'),
        envioDteXml: '<EnvioDTE>Purén</EnvioDTE>',
        dteReferenceIds: ['F55T33']
      })
    ).rejects.toThrow(FiscalValidationError);

    expect(DteSigner.verify).toHaveBeenCalledWith(
      '<EnvioDTE>Purén</EnvioDTE>',
      'F55T33'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debe rechazar caracteres no representables en ISO-8859-1 antes del fetch', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const gateway = new SiiHttpGateway();
    await expect(
      gateway.sendDte({
        env: 'CERTIFICATION',
        token: 'SESSION_TOKEN_123',
        rutSender: Rut.of('15123456-9'),
        rutCompany: Rut.of('76123456-0'),
        envioDteXml: '<EnvioDTE>😀</EnvioDTE>',
        dteReferenceIds: ['F55T33']
      })
    ).rejects.toThrow(SiiSubmissionError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debe lanzar SiiSubmissionError si el SII responde con STATUS diferente de 0', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        `<RECEPCIONDTE>
          <STATUS>3</STATUS>
          <DETAIL>Error de esquema: Caratula invalida</DETAIL>
        </RECEPCIONDTE>`,
        { status: 200 }
      )
    );

    const gateway = new SiiHttpGateway();
    await expect(
      gateway.sendDte({
        env: 'CERTIFICATION',
        token: 'TOKEN',
        rutSender: Rut.of('15123456-9'),
        rutCompany: Rut.of('76123456-0'),
        envioDteXml: '<xml>',
        dteReferenceIds: ['F55T33']
      })
    ).rejects.toThrow(SiiSubmissionError);
  });

  it('debe clasificar como procesado aceptado si ACEPTADOS es mayor que cero', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
          <SOAP-ENV:Body>
            <getEstUpResponse>
              <getEstUpReturn>&lt;SII:RESPUESTA xmlns:SII=&quot;http://www.sii.cl/XMLSchema&quot;&gt;&lt;SII:RESP_BODY&gt;&lt;SII:ACEPTADOS&gt;1&lt;/SII:ACEPTADOS&gt;&lt;SII:RECHAZADOS&gt;0&lt;/SII:RECHAZADOS&gt;&lt;/SII:RESP_BODY&gt;&lt;SII:RESP_HDR&gt;&lt;SII:ESTADO&gt;EPR&lt;/SII:ESTADO&gt;&lt;SII:GLOSA&gt;Envio Procesado&lt;/SII:GLOSA&gt;&lt;/SII:RESP_HDR&gt;&lt;/SII:RESPUESTA&gt;</getEstUpReturn>
            </getEstUpResponse>
          </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`,
        { status: 200 }
      )
    );

    const gateway = new SiiHttpGateway();
    const result = await gateway.querySendStatus({
      env: 'CERTIFICATION',
      token: 'TOKEN',
      rutCompany: Rut.of('76123456-0'),
      trackId: '8877665544'
    });

    expect(result.status).toBe('EPR');
    expect(result.glosa).toBe('Envio Procesado');
    expect(result.rawResponse).toContain('<SOAP-ENV:Envelope');
  });

  it('debe clasificar como rechazado un envío EPR con ACEPTADOS=0 y RECHAZADOS=1', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
          <soapenv:Body>
            <getEstUpResponse>
              <getEstUpReturn>&lt;SII:RESPUESTA xmlns:SII=&quot;http://www.sii.cl/XMLSchema&quot;&gt;&lt;SII:RESP_BODY&gt;&lt;SII:ACEPTADOS&gt;0&lt;/SII:ACEPTADOS&gt;&lt;SII:RECHAZADOS&gt;1&lt;/SII:RECHAZADOS&gt;&lt;/SII:RESP_BODY&gt;&lt;SII:RESP_HDR&gt;&lt;SII:ESTADO&gt;EPR&lt;/SII:ESTADO&gt;&lt;SII:GLOSA&gt;Envio Procesado&lt;/SII:GLOSA&gt;&lt;/SII:RESP_HDR&gt;&lt;/SII:RESPUESTA&gt;</getEstUpReturn>
            </getEstUpResponse>
          </soapenv:Body>
        </soapenv:Envelope>`,
        { status: 200 }
      )
    );

    const gateway = new SiiHttpGateway();
    const result = await gateway.querySendStatus({
      env: 'CERTIFICATION',
      token: 'TOKEN',
      rutCompany: Rut.of('76123456-0'),
      trackId: '8877665544'
    });

    expect(result.status).toBe('RECH');
    expect(result.glosa).toBeUndefined();
    expect(result.rawResponse).toContain('Envio Procesado');
    expect(result.rawResponse).toContain('&lt;SII:ACEPTADOS&gt;0');
    expect(result.rawResponse).toContain('&lt;SII:RECHAZADOS&gt;1');
  });

  it('no debe interpretar EPR como aceptación si la respuesta no informa contadores', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
          <SOAP-ENV:Body>
            <getEstUpResponse>
              <getEstUpReturn>&lt;RESP_BODY&gt;&lt;ESTADO&gt;EPR&lt;/ESTADO&gt;&lt;GLOSA&gt;Envio Procesado&lt;/GLOSA&gt;&lt;/RESP_BODY&gt;</getEstUpReturn>
            </getEstUpResponse>
          </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`,
        { status: 200 }
      )
    );

    const gateway = new SiiHttpGateway();
    const result = await gateway.querySendStatus({
      env: 'CERTIFICATION',
      token: 'TOKEN',
      rutCompany: Rut.of('76123456-0'),
      trackId: '8877665544'
    });

    expect(result.status).toBe('UNKNOWN');
    expect(result.glosa).toBe('Envio Procesado');
  });

  it('debe lanzar SiiConnectionError ante fallo de red o timeout', async () => {
    const fetchError = new TypeError('fetch failed') as TypeError & {
      cause?: Error & { code?: string };
    };
    fetchError.cause = Object.assign(
      new Error('connect ETIMEDOUT 192.0.2.10:443'),
      { code: 'ETIMEDOUT' }
    );
    globalThis.fetch = vi.fn().mockRejectedValue(fetchError);

    const gateway = new SiiHttpGateway({ timeoutMs: 50 });
    const error = await gateway
      .getSeed('CERTIFICATION')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SiiConnectionError);
    expect((error as Error).message).toContain('ETIMEDOUT');
  });
});
