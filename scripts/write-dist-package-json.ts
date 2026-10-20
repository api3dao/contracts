// Node reads the module format from the nearest package.json. The root one says module, so the
// CommonJS output needs its own marker or Node parses it as ES modules and every require fails.
// The marker is also where yargs reads the bin's --version from.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import packageJson from '../package.json' with { type: 'json' };

for (const [directory, type] of [
  ['esm', 'module'],
  ['cjs', 'commonjs'],
] as const) {
  writeFileSync(
    join('dist', directory, 'package.json'),
    `${JSON.stringify({ type, version: packageJson.version }, null, 2)}\n`
  );
}
