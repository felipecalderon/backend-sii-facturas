import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SiiHttpGateway } from './sii-http.gateway.js';
import { Rut } from '../../domain/shared/rut.vo.js';
import {
  SiiAuthenticationError,
  SiiConnectionError,
  SiiSubmissionError
} from '../../domain/sii/errors/sii-domain.error.js';

describe('SiiHttpGateway', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
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

    const gateway = new SiiHttpGateway();
    const result = await gateway.sendDte({
      env: 'CERTIFICATION',
      token: 'SESSION_TOKEN_123',
      rutSender: Rut.of('15123456-9'),
      rutCompany: Rut.of('76123456-0'),
      envioDteXml: '<EnvioDTE><SetDTE></SetDTE></EnvioDTE>'
    });

    expect(result.trackId).toBe('8877665544');
    expect(result.status).toBe('0');
    expect((capturedHeaders as any).Cookie).toBe('TOKEN=SESSION_TOKEN_123');
    expect(capturedBody).toBeInstanceOf(FormData);
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
        envioDteXml: '<xml>'
      })
    ).rejects.toThrow(SiiSubmissionError);
  });

  it('debe consultar el estado del envío mediante QueryEstUp y mapear respuestas', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
          <SOAP-ENV:Body>
            <getEstUpResponse>
              <getEstUpReturn>&lt;?xml version="1.0"?&gt;&lt;RESP_BODY&gt;&lt;ESTADO&gt;EPR&lt;/ESTADO&gt;&lt;GLOSA&gt;Envio Procesado&lt;/GLOSA&gt;&lt;/RESP_BODY&gt;</getEstUpReturn>
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
  });

  it('debe lanzar SiiConnectionError ante fallo de red o timeout', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('Network connection timeout'));

    const gateway = new SiiHttpGateway({ timeoutMs: 50 });
    await expect(gateway.getSeed('CERTIFICATION')).rejects.toThrow(
      SiiConnectionError
    );
  });
});
