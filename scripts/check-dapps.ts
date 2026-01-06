import fs from 'node:fs';
import path from 'node:path';

import { DAPPS } from '../src/generated/dapps';
import { dappSchema, type Dapp } from '../src/types';
import { deepEqual } from '../src/utils/deep-equal';

const INPUT_DIR = path.join('data', 'dapps');

const fileNames = fs.readdirSync(INPUT_DIR);
const jsonFiles = fileNames.filter((fileName) => fileName.endsWith('.json'));

const logs: string[] = [];

const jsonDapps: Dapp[] = jsonFiles.map((filePath: string) => {
  const fullPath = path.join(INPUT_DIR, filePath);
  const fileContentRaw = fs.readFileSync(fullPath, 'utf8');
  const dapp: Dapp = JSON.parse(fileContentRaw);

  return dapp;
});

// Lookup by alias
const dappsMap = new Map(DAPPS.map((dapp) => [Object.keys(dapp.aliases)[0], dapp]));
const jsonDappsMap = new Map(jsonDapps.map((dapp) => [Object.keys(dapp.aliases)[0], dapp]));

// Validation: Ensure that each JSON file is represented in the DAPPS array
const dappNames = new Set(dappsMap.keys());
const jsonNames = new Set(jsonDappsMap.keys());
if (DAPPS.length !== jsonDapps.length) {
  logs.push(
    'Generated dapps differs in length to the number of JSON files',
    `Generated DAPPS length = ${DAPPS.length}. Expected ${jsonDapps.length} dApps\n`
  );
}

const missingInDapps = [...jsonNames].filter((name) => !dappNames.has(name));
if (missingInDapps.length > 0) {
  logs.push(`Missing in DAPPS: ${missingInDapps.join(', ')}\n`);
}
const missingInJson = [...dappNames].filter((name) => !jsonNames.has(name));
if (missingInJson.length > 0) {
  logs.push(`Missing in JSON files: ${missingInJson.join(', ')}\n`);
}

jsonDapps.forEach((dapp: Dapp) => {
  const dappName = Object.keys(dapp.aliases)[0];

  const res = dappSchema.safeParse(dapp);
  // Validation: Ensure each JSON file content conforms to the required schema
  if (!res.success) {
    const errors = res.error.issues.map((issue) => {
      return `  path: '${issue.path.join('.')}' => '${issue.message}' `;
    });
    logs.push(`dApp '${dappName}' contains the following errors:\n${errors.join('\n')}\n`);
  }

  const existingDapp = dappsMap.get(dappName);
  if (existingDapp && !deepEqual(dapp, existingDapp)) {
    logs.push(`dApp '${dappName}' differs to the currently generated Dapp object in DAPPS\n`);
  }
});

if (logs.length > 0) {
  // eslint-disable-next-line no-console
  logs.forEach((log) => console.error(log));
  process.exit(1);
}

process.exit(0);
