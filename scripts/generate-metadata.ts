import fs from 'node:fs';

import { METADATA_FILE, getMetadataModule } from './src/json-modules.js';

async function main(): Promise<void> {
  fs.writeFileSync(METADATA_FILE, await getMetadataModule());
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
