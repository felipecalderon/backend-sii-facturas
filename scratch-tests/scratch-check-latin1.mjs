import fs from 'node:fs';

// Suppose a JS string has 'Purén'
const str = '<CmnaOrigen>Purén</CmnaOrigen>';
console.log('Original string code points:', [...str].map(c => c.codePointAt(0).toString(16)));

const buf = Buffer.from(str, 'latin1');
console.log('Buffer.from(str, "latin1") bytes:', [...buf].map(b => b.toString(16)));

const blob = new Blob([buf], { type: 'text/xml' });
const req = new Request('http://localhost', { method: 'POST', body: blob });
const arrayBuf = await req.arrayBuffer();
const sentBytes = Buffer.from(arrayBuf);
console.log('Blob sent bytes:', [...sentBytes].map(b => b.toString(16)));
