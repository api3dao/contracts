import * as fs from 'node:fs';
import path from 'node:path';

import { CHAINS } from '../src/generated/chains';
import { type Chain } from '../src/types';
import { toUpperSnakeCase } from '../src/utils/strings';

const INPUT_DIR = path.join('data', 'chains');

const fileNames = fs.readdirSync(INPUT_DIR);
const jsonFiles = fileNames.filter((fileName) => fileName.endsWith('.json'));

const logs: string[] = [];

const jsonChains: Chain[] = jsonFiles.map((filePath: string) => {
  const fullPath = path.join(INPUT_DIR, filePath);
  const fileContentRaw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(fileContentRaw);
});

const chainsMap = new Map(CHAINS.map((chain) => [chain.alias, chain]));
const jsonChainsMap = new Map(jsonChains.map((chain) => [chain.alias, chain]));

const chainAliases = new Set(chainsMap.keys());
const jsonAliases = new Set(jsonChainsMap.keys());

const missingInChains = [...jsonAliases].filter((alias) => !chainAliases.has(alias));
if (missingInChains.length > 0) {
  logs.push(`Missing in CHAINS: ${missingInChains.join(', ')}\n`);
}
const missingInJson = [...chainAliases].filter((alias) => !jsonAliases.has(alias));
if (missingInJson.length > 0) {
  logs.push(`Missing in JSON files: ${missingInJson.join(', ')}\n`);
}

const apiKeyEnvNames = jsonChains
  .filter((chain) => chain.explorer?.api?.key?.required)
  .map((chain) => `ETHERSCAN_API_KEY_${toUpperSnakeCase(chain.alias)}`);

const expectedEnvVars = ['MNEMONIC', ...apiKeyEnvNames];
const expectedEnvFile = expectedEnvVars.reduce((fileContents: string, envVariableName: string) => {
  return `${fileContents}${envVariableName}=\n`;
}, '');

const exampleEnvFile = fs.readFileSync('example.env', 'utf8');

if (exampleEnvFile !== expectedEnvFile) {
  logs.push('Please update example.env running "pnpm write-example-env-file"');
}

if (logs.length > 0) {
  // eslint-disable-next-line no-console
  logs.forEach((log) => console.error(log));
  process.exit(1);
}

process.exit(0);
