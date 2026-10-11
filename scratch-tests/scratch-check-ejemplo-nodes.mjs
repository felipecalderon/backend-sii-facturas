import fs from 'node:fs';

const ejemplo = fs.readFileSync('DTE33-ejemplo.xml', 'utf8');

const emisorMatch = ejemplo.match(/<Emisor>[\s\S]*?<\/Emisor>/);
console.log('--- Emisor in ejemplo ---');
console.log(emisorMatch ? emisorMatch[0] : 'not found');

const receptorMatch = ejemplo.match(/<Receptor>[\s\S]*?<\/Receptor>/);
console.log('--- Receptor in ejemplo ---');
console.log(receptorMatch ? receptorMatch[0] : 'not found');
