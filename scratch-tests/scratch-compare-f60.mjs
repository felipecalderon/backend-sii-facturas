import fs from 'node:fs';

const f60 = fs.readFileSync('docs/schemas-sii/F60T33-ejemplo.xml', 'utf8');
const f10 = fs.readFileSync('folio-10-envio.xml', 'utf8');

console.log('f60 length:', f60.length);
console.log('f10 length:', f10.length);

// Compare XML structure
function getStructure(xml) {
  return xml.replace(/>[^<]+</g, '><').replace(/\s+/g, ' ');
}

console.log('f60 root tag:', f60.slice(0, 250));
console.log('f10 root tag:', f10.slice(0, 250));
