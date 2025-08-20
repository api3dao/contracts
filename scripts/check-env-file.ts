import * as fs from 'node:fs';

import { CHAINS } from '../src/generated/chains';
import { toUpperSnakeCase } from '../src/utils/strings';

async function main() {
  const logs: string[] = [];

  const apiKeyEnvNames = CHAINS.filter((chain) => chain.explorer?.api?.key?.required).map(
    (chain) => `ETHERSCAN_API_KEY_${toUpperSnakeCase(chain.alias)}=`
  );

  const expectedEnvVars = ['MNEMONIC=', ...apiKeyEnvNames].join('\n');

  const exampleEnvPath = './example.env';
  let exampleEnvContents = '';

  try {
    exampleEnvContents = fs.readFileSync(exampleEnvPath, `utf-8`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Error reading ${exampleEnvPath}: ${error}`);
    process.exit(1);
  }

  const missingEnvVars = expectedEnvVars.split('\n').filter((line) => line && !exampleEnvContents.includes(line));
  const extraEnvVars = exampleEnvContents.split('\n').filter((line) => line && !expectedEnvVars.includes(line));

  if (missingEnvVars.length > 0) {
    logs.push(`Missing env vars in example.env:\n${missingEnvVars.join('\n')}`);
  }
  if (extraEnvVars.length > 0) {
    logs.push(`Extra env vars in example.env:\n${extraEnvVars.join('\n')}`);
  }

  if (logs.length > 0) {
    logs.push('Please update example.env running "pnpm write-example-env-file"');
    // eslint-disable-next-line no-console
    logs.forEach((log) => console.error(log));
    process.exit(1);
  }
}

main();
