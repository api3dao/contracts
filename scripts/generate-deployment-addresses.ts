import * as fs from 'node:fs';
import { join } from 'node:path';

import { getDeploymentAddresses } from './src/deployment-addresses';

async function main(): Promise<void> {
  fs.writeFileSync(join('deployments', 'addresses.json'), getDeploymentAddresses());
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
