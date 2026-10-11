import fs from 'node:fs';

const ejemplo = fs.readFileSync('DTE33-ejemplo.xml', 'utf8');

const tedMatch = ejemplo.match(/<TED[\s\S]*?<\/TED>/);
console.log('--- TED in ejemplo ---');
console.log(tedMatch ? tedMatch[0] : 'not found');
