import fs from 'node:fs';

const dteXsd = fs.readFileSync('docs/schemas-sii/DTE_v10.xsd', 'latin1');
const pos = dteXsd.indexOf('name="CAF"');
console.log(dteXsd.slice(pos + 1200, pos + 3000));
