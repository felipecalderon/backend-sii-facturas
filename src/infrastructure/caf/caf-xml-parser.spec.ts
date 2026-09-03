import { describe, it, expect } from 'vitest';
import { CafXmlParser } from './caf-xml-parser.js';
import { InvalidCafXmlError } from '../../domain/folio/errors/folio-domain.error.js';

describe('CafXmlParser', () => {
  const sampleValidXml = `
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>97975000-5</RE>
      <RS>RUT DE PRUEBA</RS>
      <TD>33</TD>
      <RNG>
        <D>1</D>
        <H>200</H>
      </RNG>
      <FA>2026-09-03</FA>
      <RSAPK>
        <M>0a4O6Kbx8Qj3K4iWSP4w7KneZYeJ+g/prihYtIEolKt3cykSxl1zO8vSXu397QhTmsX7SBEudTUx++2zDXBhZw==</M>
        <E>Aw==</E>
      </RSAPK>
      <IDK>100</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">g1AQX0sy8NJugX52k2hTJEZAE9Cuul6pqYBdFxj1N17umW7zG/hAavCALKByHzdYAfZ3LhGTXCai5zNxOo4lDQ==</FRMA>
  </CAF>
  <RSASK>
-----BEGIN RSA PRIVATE KEY-----
MIIBOwIBAAJBANGuDuim8fEI9yuIlkj+MOyp3mWHifoP6a4oWLSBKJSrd3MpEsZd
czvL0l7t/e0IU5rF+0gRLnU1Mfvtsw1wYWcCAwEAAQJAXe+r6FqOqj8N12e/aV4v
-----END RSA PRIVATE KEY-----
  </RSASK>
</AUTORIZACION>
`;

  it('debe parsear correctamente un XML de CAF válido y extraer sus metadatos y clave RSA', () => {
    const result = CafXmlParser.parse(sampleValidXml);

    expect(result.rutEmisor.toCanonical()).toBe('97975000-5');
    expect(result.razonSocial).toBe('RUT DE PRUEBA');
    expect(result.tipoDte.code).toBe(33);
    expect(result.rangoDesde).toBe(1);
    expect(result.rangoHasta).toBe(200);
    expect(result.idClave).toBe(100);
    expect(result.clavePrivadaPem).toContain('-----BEGIN RSA PRIVATE KEY-----');
    expect(result.cafXml).toContain('<CAF version="1.0">');
    expect(result.cafXml).toContain('</CAF>');
  });

  it('debe rechazar XML que no contenga el nodo <CAF>', () => {
    const invalidXml = '<AUTORIZACION><RSASK>key</RSASK></AUTORIZACION>';
    expect(() => CafXmlParser.parse(invalidXml)).toThrow(InvalidCafXmlError);
  });

  it('debe rechazar XML que no contenga la clave privada <RSASK>', () => {
    const invalidXml = '<AUTORIZACION><CAF><DA></DA></CAF></AUTORIZACION>';
    expect(() => CafXmlParser.parse(invalidXml)).toThrow(InvalidCafXmlError);
  });

  it('debe rechazar rangos de folios inconsistentes (desde > hasta)', () => {
    const inconsistentRangeXml = sampleValidXml
      .replace('<D>1</D>', '<D>500</D>')
      .replace('<H>200</H>', '<H>200</H>');

    expect(() => CafXmlParser.parse(inconsistentRangeXml)).toThrow(
      InvalidCafXmlError
    );
  });
});
