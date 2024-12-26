import * as fs from 'node:fs';
import { join } from 'node:path';

import { getDeploymentAddresses } from './src/deployment-addresses';

async function main(): Promise<void> {
  const deploymentAddressesFilePath = join('deployments', 'addresses.json');
  const deploymentAddresses = fs.readFileSync(deploymentAddressesFilePath, 'utf8');
  if (deploymentAddresses !== getDeploymentAddresses()) {
    throw new Error(`${deploymentAddressesFilePath} is outdated`);
  }
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
