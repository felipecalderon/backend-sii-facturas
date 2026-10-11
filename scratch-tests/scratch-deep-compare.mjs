import fs from 'node:fs';

const ej = fs.readFileSync('DTE33-ejemplo.xml', 'utf8');
const f10 = fs.readFileSync('folio-10-envio.xml', 'utf8');

function parseElements(xml) {
  const tagRegex = /<(\/)?([A-Za-z0-9_:-]+)([^>]*)>/g;
  const tokens = [];
  let match;
  while ((match = tagRegex.exec(xml)) !== null) {
    const isClosing = !!match[1];
    const tagName = match[2];
    const attrs = match[3].trim();
    const isSelfClosing = attrs.endsWith('/');
    tokens.push({ isClosing, tagName, attrs, isSelfClosing });
  }
  return tokens;
}

const ejTokens = parseElements(ej);
const f10Tokens = parseElements(f10);

console.log('ej total tags:', ejTokens.length);
console.log('f10 total tags:', f10Tokens.length);

// Compare sequence of opening tags
const ejStructure = ejTokens.filter(t => !t.isClosing).map(t => t.tagName);
const f10Structure = f10Tokens.filter(t => !t.isClosing).map(t => t.tagName);

console.log('\n--- Tags in f10 that are NOT in ej ---');
const ejSet = new Set(ejStructure);
f10Structure.forEach(t => {
  if (!ejSet.has(t)) console.log('+', t);
});

console.log('\n--- Tags in ej that are NOT in f10 ---');
const f10Set = new Set(f10Structure);
ejStructure.forEach(t => {
  if (!f10Set.has(t)) console.log('-', t);
});
