import fs from 'node:fs';

const ejemplo = fs.readFileSync('DTE33-ejemplo.xml', 'utf8');
const f10 = fs.readFileSync('folio-10-envio.xml', 'utf8');

function getTagNames(xml) {
  const matches = xml.match(/<([A-Za-z0-9_:-]+)/g) || [];
  return matches.map(m => m.slice(1));
}

console.log('Tags in ejemplo:', new Set(getTagNames(ejemplo)));
console.log('Tags in f10:', new Set(getTagNames(f10)));

const tagsInF10Only = [...new Set(getTagNames(f10))].filter(t => !new Set(getTagNames(ejemplo)).has(t));
const tagsInEjemploOnly = [...new Set(getTagNames(ejemplo))].filter(t => !new Set(getTagNames(f10)).has(t));

console.log('In f10 only:', tagsInF10Only);
console.log('In ejemplo only:', tagsInEjemploOnly);
