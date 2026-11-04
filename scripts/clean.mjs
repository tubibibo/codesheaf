import { rmSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const rootDir = fileURLToPath(new URL('..', import.meta.url));

rmSync(resolve(rootDir, 'out'), { recursive: true, force: true });
rmSync(resolve(rootDir, 'coverage'), { recursive: true, force: true });

for (const vsix of globSync('*.vsix', { cwd: rootDir })) {
  rmSync(resolve(rootDir, vsix), { force: true });
}

console.log('cleaned: out/, coverage/, *.vsix');
