import fs from 'node:fs';

import { METADATA_FILE, getMetadataModule } from './src/json-modules.js';

async function main(): Promise<void> {
  if (fs.readFileSync(METADATA_FILE, 'utf8') !== (await getMetadataModule())) {
    throw new Error(`${METADATA_FILE} is outdated`);
  }
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
