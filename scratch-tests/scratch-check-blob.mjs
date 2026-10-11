import fs from 'node:fs';

const xml = fs.readFileSync('folio-10-envio.xml', 'latin1');
const xmlBuffer = Buffer.from(xml, 'latin1');
const blob = new Blob([xmlBuffer], { type: 'text/xml' });
const formData = new FormData();
formData.append('archivo', blob, 'envio.xml');

// Let's inspect the Request created with this formData
const req = new Request('http://localhost', { method: 'POST', body: formData });
const arrayBuf = await req.arrayBuffer();
const sentBytes = Buffer.from(arrayBuf);

console.log('Total sent bytes:', sentBytes.length);
console.log('First 300 bytes:\n', sentBytes.slice(0, 300).toString('latin1'));

// Check if Purén is in sentBytes as latin1 (0xE9) or utf-8 (0xC3 0xA9)
const purenIdx = sentBytes.indexOf(Buffer.from('Pur'));
if (purenIdx !== -1) {
  console.log('Byte after Pur:', sentBytes[purenIdx + 3].toString(16)); // should be e9 for latin1
}
