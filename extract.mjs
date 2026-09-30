import fs from 'node:fs';
import path from 'node:path';
import extract from 'extract-zip';

const chunks = Array.from({ length: 9 }, (_, i) =>
  fs.readFileSync(`chunks/part-${String(i + 1).padStart(2, '0')}.b64`, 'utf8').trim()
).join('');

const zipPath = path.resolve('Bricksy-FullStack-MVP.zip');
fs.writeFileSync(zipPath, Buffer.from(chunks, 'base64'));
await extract(zipPath, { dir: path.resolve('deployed') });
console.log('Bricksy source extracted.');
