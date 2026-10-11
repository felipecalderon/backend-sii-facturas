import fs from 'node:fs';
import { validateXML } from 'xmllint-wasm';

const envioXsd = fs.readFileSync('docs/schemas-sii/EnvioDTE_v10.xsd', 'utf8');
const dteXsd = fs.readFileSync('docs/schemas-sii/DTE_v10.xsd', 'utf8');
const siiTypesXsd = fs.readFileSync('docs/schemas-sii/SiiTypes_v10.xsd', 'utf8');
const xmldsigXsd = fs.readFileSync('docs/schemas-sii/xmldsignature_v10.xsd', 'utf8');

const xml = fs.readFileSync('folio-10-envio.xml', 'utf8');
const brokenXml = xml.replace('<TipoDTE>33</TipoDTE>', '<TipoDTE>33</TipoDTE><ElementoInvalido>test</ElementoInvalido>');

const res = await validateXML({
  xml: brokenXml,
  schema: { fileName: 'EnvioDTE_v10.xsd', contents: envioXsd },
  preload: [
    { fileName: 'DTE_v10.xsd', contents: dteXsd },
    { fileName: 'SiiTypes_v10.xsd', contents: siiTypesXsd },
    { fileName: 'xmldsignature_v10.xsd', contents: xmldsigXsd }
  ]
});

console.log('Broken XML validation valid:', res.valid);
console.log('Errors:', res.errors);
