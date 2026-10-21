// Packages apps/extension/dist into apps/extension/langcoach-extension-<version>.zip with manifest.json at the archive root.
// Pure Node.js (node:zlib + standard ZIP format), zero external dependencies.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const extRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(extRoot, 'dist');
const pkg = JSON.parse(readFileSync(join(extRoot, 'package.json'), 'utf8'));
const outPath = join(extRoot, `langcoach-extension-${pkg.version}.zip`);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const files = walk(distDir);
if (!files.some((f) => relative(distDir, f).replace(/\\/g, '/') === 'manifest.json')) {
  throw new Error('dist/manifest.json not found. Run npm run build -w @langcoach/extension first.');
}

const localParts = [];
const centralParts = [];
let offset = 0;

for (const full of files) {
  const relName = relative(distDir, full).replace(/\\/g, '/');
  const nameBuf = Buffer.from(relName, 'utf8');
  const raw = readFileSync(full);
  const comp = deflateRawSync(raw);
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 flag
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(0, 10); // mod time
  local.writeUInt16LE(0x21, 12); // mod date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  localParts.push(local, nameBuf, comp);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // signature
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0x0800, 8); // UTF-8 flag
  central.writeUInt16LE(8, 10); // deflate
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(offset, 42);

  centralParts.push(central, nameBuf);
  offset += local.length + nameBuf.length + comp.length;
}

const centralSize = centralParts.reduce((n, b) => n + b.length, 0);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralSize, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

writeFileSync(outPath, Buffer.concat([...localParts, ...centralParts, eocd]));
console.log(`Packaged ${files.length} files into ${outPath}`);
