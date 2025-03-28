import fs from 'node:fs';
import path from 'node:path';

import { goSync } from '@api3/promise-utils';
import { format } from 'prettier';

import { dappSchema } from '../src/types';

const PRETTIER_CONFIG = path.join(__dirname, '..', '.prettierrc');
const INPUT_DIR = path.join(__dirname, '..', 'data', 'dapps');
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'generated');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'dapps.ts');

const HEADER_CONTENT = `// ===========================================================================
// DO NOT EDIT THIS FILE MANUALLY!
//
// The contents have been added automatically.
// See: scripts/generate-dapps.ts for more information
// ===========================================================================

import { type Dapp } from '../types';
`;

async function main(): Promise<void> {
  const fileNames = fs.readdirSync(INPUT_DIR);
  const jsonFiles = fileNames.filter((fileName) => fileName.endsWith('.json'));
  const combinedDapps: any = [];

  for (const jsonFile of jsonFiles) {
    const filePath = path.join(INPUT_DIR, jsonFile);
    const goFileContent = goSync(() => dappSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf8'))));
    if (!goFileContent.success) {
      throw new Error(`Invalid dApps file content: ${filePath}\n${goFileContent.error}`);
    }
    const fileContent = goFileContent.data;
    combinedDapps.push(fileContent);
  }

  const aliases = combinedDapps.flatMap((dapp: any) => Object.keys(dapp.aliases));
  if (aliases.length !== new Set(aliases).size) {
    throw new Error(`Duplicate dApp aliases found. See:\n${JSON.stringify(aliases.sort(), null, 2)}`);
  }

  const rawContent = `${HEADER_CONTENT}\nexport const DAPPS: Dapp[] = ${JSON.stringify(combinedDapps)};\n\n`;

  const prettierConfig = JSON.parse(fs.readFileSync(PRETTIER_CONFIG, 'utf8'));
  const formattedContent = await format(rawContent, { ...prettierConfig, parser: 'typescript' });

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  fs.writeFileSync(OUTPUT_FILE, formattedContent);
  // eslint-disable-next-line no-console
  console.log(`Combined dApps been saved as ${OUTPUT_FILE}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.log(error);
    process.exit(1);
  });
