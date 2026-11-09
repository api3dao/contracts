import * as fs from 'node:fs';
import { join } from 'node:path';

import { getDeploymentAddresses } from './src/deployment-addresses.js';
import { DEPLOYMENT_ADDRESSES_FILE, getDeploymentAddressesModule } from './src/json-modules.js';

async function main(): Promise<void> {
  fs.writeFileSync(join('deployments', 'addresses.json'), getDeploymentAddresses());
  fs.writeFileSync(DEPLOYMENT_ADDRESSES_FILE, await getDeploymentAddressesModule());
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
