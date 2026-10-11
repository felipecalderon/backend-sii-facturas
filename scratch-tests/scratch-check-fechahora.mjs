import fs from 'node:fs';

const siiTypes = fs.readFileSync('docs/schemas-sii/SiiTypes_v10.xsd', 'latin1');
const pos = siiTypes.indexOf('name="FechaHoraType"');
console.log(siiTypes.slice(pos, pos + 500));
