import * as fs from 'node:fs';
import * as path from 'node:path';

import type { AddressLike } from 'ethers';
import { config } from 'hardhat';

import { chainsSupportedByDapis } from '../src/supported-chains';

module.exports = () => {
  const references: Record<string, Record<string, AddressLike>> = {};
  const deploymentBlockNumbers: Record<string, Record<string, number | string>> = {};

  for (const contractName of ['AccessControlRegistry', 'OwnableCallForwarder', 'Api3ServerV1', 'ProxyFactory']) {
    references[contractName] = {};
    deploymentBlockNumbers[contractName] = {};
    for (const network of chainsSupportedByDapis) {
      const deployment = JSON.parse(fs.readFileSync(path.join('deployments', network, `${contractName}.json`), 'utf8'));
      references[contractName]![config.networks[network]!.chainId!] = deployment.address;
      if (deployment.receipt) {
        deploymentBlockNumbers[contractName]![config.networks[network]!.chainId!] = deployment.receipt.blockNumber;
      } else {
        deploymentBlockNumbers[contractName]![config.networks[network]!.chainId!] = 'MISSING';
      }
    }
  }

  fs.writeFileSync(path.join('deployments', 'addresses.json'), JSON.stringify(references, null, 2));
  fs.writeFileSync(path.join('deployments', 'block-numbers.json'), JSON.stringify(deploymentBlockNumbers, null, 2));
};
module.exports.tags = ['document'];
