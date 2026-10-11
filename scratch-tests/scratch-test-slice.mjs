import fs from 'node:fs';

const xml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n<Documento>test</Documento>\n</DTE>';
const rootTagMatch = xml.match(/<DTE\b[^>]*>/);
const rootTag = rootTagMatch[0];
console.log('rootTagMatch.index:', rootTagMatch.index);
console.log('rootTag.length:', rootTag.length);
console.log('xml.slice(rootTag.length):\n', xml.slice(rootTag.length));
console.log('CORRECT SLICE:\n', xml.slice(rootTagMatch.index + rootTag.length));
