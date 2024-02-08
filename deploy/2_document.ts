import * as fs from 'node:fs';
import * as path from 'node:path';

import type { AddressLike } from 'ethers';
import { config } from 'hardhat';

import {
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';

module.exports = () => {
  const references: Record<string, Record<string, AddressLike>> = {};
  const deploymentBlockNumbers: Record<string, Record<string, number>> = {};

  const networks = new Set([...chainsSupportedByDapis, ...chainsSupportedByMarket, ...chainsSupportedByOevAuctions]);

  for (const network of networks) {
    const chainId = config.networks[network]!.chainId!;
    const contractNames = [
      ...(chainsSupportedByDapis.includes(network)
        ? ['AccessControlRegistry', 'OwnableCallForwarder', 'Api3ServerV1', 'ProxyFactory']
        : []),
      ...(chainsSupportedByMarket.includes(network) ? ['Api3Market'] : []),
      ...(chainsSupportedByOevAuctions.includes(network) ? ['OevAuctionHouse'] : []),
    ];
    for (const contractName of contractNames) {
      const deployment = JSON.parse(fs.readFileSync(path.join('deployments', network, `${contractName}.json`), 'utf8'));
      references[contractName] = { ...references[contractName], [chainId]: deployment.address };
      if (!deployment.receipt) {
        throw new Error(`${network} ${contractName} missing deployment tx receipt`);
      }
      deploymentBlockNumbers[contractName] = {
        ...deploymentBlockNumbers[contractName],
        chainId: deployment.receipt.blockNumber,
      };
    }
  }
  fs.writeFileSync(path.join('deployments', 'addresses.json'), `${JSON.stringify(references, null, 2)}\n`);
  fs.writeFileSync(
    path.join('deployments', 'block-numbers.json'),
    `${JSON.stringify(deploymentBlockNumbers, null, 2)}\n`
  );
};
module.exports.tags = ['document'];
