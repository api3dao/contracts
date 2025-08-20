import { createHash } from 'node:crypto';
import * as fs from 'node:fs';

import { CHAINS } from '../src/generated/chains';
import { toUpperSnakeCase } from '../src/utils/strings';

async function main() {
  const logs: string[] = [];

  const expectedEnvVars = [
    'MNEMONIC=',
    ...CHAINS.filter((c) => c.explorer?.api?.key?.required).map(
      (c) => `ETHERSCAN_API_KEY_${toUpperSnakeCase(c.alias)}=`
    ),
  ];

  const exampleEnvPath = './example.env';
  let exampleEnvContents: string;

  try {
    exampleEnvContents = fs.readFileSync(exampleEnvPath, `utf-8`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Error reading ${exampleEnvPath}: ${error}`);
    process.exit(1);
  }

  const exampleLines = exampleEnvContents.split('\n').filter(Boolean);

  const hashExpectedEnvVars = createHash('sha256').update(expectedEnvVars.join('\n')).digest('hex');
  const hashExampleLines = createHash('sha256').update(exampleLines.join('\n')).digest('hex');

  const missing = expectedEnvVars.filter((v) => !exampleLines.includes(v));
  const extra = exampleLines.filter((v) => !expectedEnvVars.includes(v));
  const duplicates = exampleLines.filter((value, index, arr) => arr.indexOf(value) !== index);

  if (hashExpectedEnvVars !== hashExampleLines) {
    logs.push(`example.env file is not up to date with expected environment variables.`);
  }

  if (missing.length > 0) {
    logs.push(`Missing env vars in example.env:\n${missing.join('\n')}`);
  }

  if (extra.length > 0) {
    logs.push(`Extra env vars in example.env:\n${extra.join('\n')}`);
  }

  if (duplicates.length > 0) {
    logs.push(`Duplicate env vars in example.env:\n${[...new Set(duplicates)].join('\n')}`);
  }

  if (logs.length > 0) {
    logs.push('Please update example.env running "pnpm write-example-env-file"');
    // eslint-disable-next-line no-console
    logs.forEach((log) => console.error(log));
    process.exit(1);
  }
}

main();
