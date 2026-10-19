// Assemble build/icon.ico from the PNGs produced by scripts/make-icons.ps1.
// ICO entries may store PNG data directly (supported since Windows Vista),
// so no pixel conversion is needed — just headers + the PNG blobs.
// Usage: node scripts/make-ico.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sizes = [16, 24, 32, 48, 64, 128, 256];

const images = sizes.map((size) => ({
  size,
  data: fs.readFileSync(path.join(root, 'build', `icon-${size}.png`)),
}));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);

let offset = 6 + 16 * images.length;
const entries = [];
for (const img of images) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // width  (0 = 256)
  entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // height (0 = 256)
  entry.writeUInt8(0, 2); // palette colours
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(img.data.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += img.data.length;
  entries.push(entry);
}

const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
const out = path.join(root, 'build', 'icon.ico');
fs.writeFileSync(out, ico);
console.log(`wrote ${out} (${ico.length} bytes, ${images.length} sizes)`);
