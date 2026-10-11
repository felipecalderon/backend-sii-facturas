import fs from 'node:fs';
import { validateXML } from 'xmllint-wasm';

const envioXsd = fs.readFileSync('docs/schemas-sii/EnvioDTE_v10.xsd', 'utf8');
const dteXsd = fs.readFileSync('docs/schemas-sii/DTE_v10.xsd', 'utf8');
const siiTypesXsd = fs.readFileSync('docs/schemas-sii/SiiTypes_v10.xsd', 'utf8');
const xmldsigXsd = fs.readFileSync('docs/schemas-sii/xmldsignature_v10.xsd', 'utf8');

// Test 1: Validate folio 10 Envio
const f10Envio = fs.readFileSync('folio-10-envio.xml', 'utf8');
const resEnvio = await validateXML({
  xml: f10Envio,
  schema: { fileName: 'EnvioDTE_v10.xsd', contents: envioXsd },
  preload: [
    { fileName: 'DTE_v10.xsd', contents: dteXsd },
    { fileName: 'SiiTypes_v10.xsd', contents: siiTypesXsd },
    { fileName: 'xmldsignature_v10.xsd', contents: xmldsigXsd }
  ]
});
console.log('Test 1 (EnvioDTE):', resEnvio.valid, resEnvio.errors);

// Test 2: Validate folio 10 DTE alone against DTE_v10.xsd
const f10Dte = fs.readFileSync('folio-10-dte.xml', 'utf8');
const resDte = await validateXML({
  xml: f10Dte,
  schema: { fileName: 'DTE_v10.xsd', contents: dteXsd },
  preload: [
    { fileName: 'SiiTypes_v10.xsd', contents: siiTypesXsd },
    { fileName: 'xmldsignature_v10.xsd', contents: xmldsigXsd }
  ]
});
console.log('Test 2 (DTE alone):', resDte.valid, resDte.errors);
