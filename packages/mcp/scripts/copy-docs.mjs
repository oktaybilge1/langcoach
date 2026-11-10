// Copies the root README and LICENSE into this package so `npm pack` ships them.
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

for (const file of ['README.md', 'LICENSE']) {
  copyFileSync(
    fileURLToPath(new URL(`../../../${file}`, import.meta.url)),
    fileURLToPath(new URL(`../${file}`, import.meta.url)),
  );
}
