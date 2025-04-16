import fs from 'node:fs';
import path from 'node:path';

import { DAPPS } from '../src/generated/dapps';
import { dappSchema, type Dapp } from '../src/types';
import { deepEqual } from '../src/utils/deep-equal';
import { toLowerKebabCase } from '../src/utils/strings';

const INPUT_DIR = path.join('data', 'dapps');

const fileNames = fs.readdirSync(INPUT_DIR);
const jsonFiles = fileNames.filter((fileName) => fileName.endsWith('.json'));

const jsonDapps: Dapp[] = jsonFiles.map((filePath: string) => {
  const fullPath = path.join(INPUT_DIR, filePath);
  const fileContentRaw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(fileContentRaw);
});

const logs: string[] = [];

// Validation: Ensure that each JSON file is represented in the DAPPS array
if (DAPPS.length !== jsonDapps.length) {
  logs.push(
    'Generated dapps differs in length to the number of JSON files',
    `Generated DAPPS length = ${DAPPS.length}. Expected ${jsonDapps.length} dApps\n`
  );
}

// Validation: Ensure that each JSON file is named as a prefix of one of the dApp's titles
jsonFiles.forEach((filePath: string, index: number) => {
  const dapp: Dapp = jsonDapps[index]!;
  const uniqueDappTitles = [
    ...new Set(Object.values(dapp.aliases).map((dappAliasValue) => toLowerKebabCase(dappAliasValue.title))),
  ];
  if (!uniqueDappTitles.some((uniqueDappTitle) => uniqueDappTitle.startsWith(filePath.replace('.json', '')))) {
    logs.push(
      'JSON file name must be the prefix of a dApp title',
      `Current value: ${filePath}. Expected to be prefix of: ${uniqueDappTitles.join('/')}\n`
    );
  }
});

jsonDapps.forEach((dapp: Dapp, index: number) => {
  const res = dappSchema.safeParse(dapp);
  // Validation: Ensure each JSON file content conforms to the required schema
  if (!res.success) {
    const errors = res.error.issues.map((issue) => {
      return `  path: '${issue.path.join('.')}' => '${issue.message}' `;
    });
    logs.push(`dApp '${Object.keys(dapp.aliases)}' contains the following errors:\n${errors.join('\n')}\n`);
  }

  // Validation: Ensure that the latest JSON content is represented in each Dapp object
  const existingDapp = DAPPS[index];
  if (!deepEqual(dapp, existingDapp)) {
    logs.push(`dApp '${Object.keys(dapp.aliases)}' differs to the currently generated Dapp object in DAPPS\n`);
  }
});

if (logs.length > 0) {
  // eslint-disable-next-line no-console
  logs.forEach((log) => console.error(log));
  process.exit(1);
}

process.exit(0);
