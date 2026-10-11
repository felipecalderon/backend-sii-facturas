import fs from 'node:fs';

const ejemplo = fs.readFileSync('DTE33-ejemplo.xml', 'utf8');

const tedIdx = ejemplo.indexOf('</TED>');
console.log(ejemplo.slice(tedIdx, tedIdx + 400));
