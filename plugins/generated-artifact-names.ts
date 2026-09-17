import { readFile, writeFile } from 'node:fs/promises';

import { glob } from 'glob';
import type { SolidityHooks } from 'hardhat/types/hooks';

// hardhat-deploy aliases contracts whose short name is not unique after their source path but
// leaves `@` alone, so the vendored @openzeppelin sources give aliases that are not valid
// identifiers and the generated index does not parse. Nothing imports them.
const ALIAS = /( as )([A-Za-z_$][\w$]*(?:@[\w$.@-]*)+)/g;

// eslint-disable-next-line import/no-default-export
export default async (): Promise<Partial<SolidityHooks>> => ({
  async processArtifactsAfterSuccessfulBuild() {
    for (const file of await glob('./generated/{abis,artifacts}/index.{ts,js,d.ts}')) {
      const contents = await readFile(file, 'utf8');
      const sanitized = contents.replaceAll(
        ALIAS,
        (_match, keyword: string, alias: string) => `${keyword}${alias.replaceAll(/[^\w$]/g, '_')}`
      );
      if (sanitized !== contents) await writeFile(file, sanitized);
    }
  },
});
