import fs from 'node:fs';
import path from 'node:path';

import { CHAINS } from '../src/generated/chains';
import { type Chain, chainSchema } from '../src/types';
import { deepEqual } from '../src/utils/deep-equal';

const INPUT_DIR = path.join('data', 'chains');

const fileNames = fs.readdirSync(INPUT_DIR);
const jsonFiles = fileNames.filter((fileName) => fileName.endsWith('.json'));

const logs: string[] = [];

const jsonChains: Chain[] = jsonFiles.map((filePath: string) => {
  const fullPath = path.join(INPUT_DIR, filePath);
  const fileContentRaw = fs.readFileSync(fullPath, 'utf8');
  const chain = JSON.parse(fileContentRaw);

  // Validation: Ensure that each JSON file is named using the chain's alias
  const fileAlias = filePath.replace('.json', '');
  if (fileAlias !== chain.alias) {
    logs.push(
      "JSON file name must match the chain's alias",
      `Current value: ${filePath}. Expected: ${chain.alias}.json\n`
    );
  }

  return chain;
});

// Lookup by alias
const chainsMap = new Map(CHAINS.map((chain) => [chain.alias, chain]));
const jsonChainsMap = new Map(jsonChains.map((chain) => [chain.alias, chain]));

// Validation: Ensure that each JSON file is represented in the CHAINS array
if (CHAINS.length !== jsonChains.length) {
  const chainAliases = new Set(chainsMap.keys());
  const jsonAliases = new Set(jsonChainsMap.keys());

  const missingInChains = [...jsonAliases].filter((alias) => !chainAliases.has(alias));
  const missingInJson = [...chainAliases].filter((alias) => !jsonAliases.has(alias));

  logs.push(
    'Generated chains differs in length to the number of JSON files',
    `Generated CHAINS length = ${CHAINS.length}. Expected ${jsonChains.length} chains`,
    missingInChains.length > 0 ? `Missing in CHAINS: ${missingInChains.join(', ')}` : '',
    missingInJson.length > 0 ? `Missing in JSON files: ${missingInJson.join(', ')}` : '',
    '\n'
  );
}

jsonChains.forEach((chain: Chain) => {
  const res = chainSchema.safeParse(chain);
  // Validation: Ensure each JSON file content conforms to the required schema
  if (!res.success) {
    const errors = res.error.issues.map((issue) => {
      return `  path: '${issue.path.join('.')}' => '${issue.message}' `;
    });
    logs.push(`Chain '${chain.name}' contains the following errors:\n${errors.join('\n')}\n`);
  }

  // Validation: Ensure that the latest JSON content is represented in each Chain object
  const existingChain = chainsMap.get(chain.alias);
  if (existingChain && !deepEqual(chain, existingChain)) {
    logs.push(`Chain '${chain.name}' differs to the currently generated Chain object in CHAINS\n`);
  }
});

if (logs.length > 0) {
  // eslint-disable-next-line no-console
  logs.forEach((log) => console.error(log));
  process.exit(1);
}

process.exit(0);
