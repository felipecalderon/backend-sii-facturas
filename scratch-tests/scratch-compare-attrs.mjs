import fs from 'node:fs';

const ej = fs.readFileSync('DTE33-ejemplo.xml', 'utf8');
const f10 = fs.readFileSync('folio-10-envio.xml', 'utf8');

function parseElementsWithAttrs(xml) {
  const tagRegex = /<([A-Za-z0-9_:-]+)([^>]*)>/g;
  const elements = [];
  let match;
  while ((match = tagRegex.exec(xml)) !== null) {
    if (match[1].startsWith('/')) continue;
    elements.push({ tag: match[1], attrs: match[2].trim() });
  }
  return elements;
}

const ejElements = parseElementsWithAttrs(ej);
const f10Elements = parseElementsWithAttrs(f10);

console.log('--- Compare tags with attributes ---');
for (const e of f10Elements) {
  if (e.attrs) {
    console.log('f10 has attrs on <' + e.tag + '>: ' + e.attrs);
  }
}
console.log('--- ej elements with attributes ---');
for (const e of ejElements) {
  if (e.attrs) {
    console.log('ej has attrs on <' + e.tag + '>: ' + e.attrs);
  }
}
