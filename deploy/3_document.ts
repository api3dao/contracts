import * as fs from 'node:fs';
import { join } from 'node:path';

import type { AddressLike } from 'ethers';
import { config } from 'hardhat';

import {
  chainsSupportedByManagerMultisig,
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';

module.exports = () => {
  const references: Record<string, Record<string, AddressLike>> = {};

  const networks = new Set([
    ...chainsSupportedByManagerMultisig,
    ...chainsSupportedByDapis,
    ...chainsSupportedByMarket,
    ...chainsSupportedByOevAuctions,
  ]);

  for (const network of networks) {
    const chainId = config.networks[network]!.chainId!;
    const contractNames = [
      ...(chainsSupportedByManagerMultisig.includes(network) ? ['GnosisSafeWithoutProxy', 'OwnableCallForwarder'] : []),
      ...(chainsSupportedByDapis.includes(network) ? ['AccessControlRegistry', 'Api3ServerV1'] : []),
      // ...(chainsSupportedByMarket.includes(network) ? ['Api3Market'] : []),
      ...(chainsSupportedByOevAuctions.includes(network) ? ['OevAuctionHouse'] : []),
    ];
    for (const contractName of contractNames) {
      const deployment = JSON.parse(fs.readFileSync(join('deployments', network, `${contractName}.json`), 'utf8'));
      references[contractName] = { ...references[contractName], [chainId]: deployment.address };
    }
  }
  fs.writeFileSync(join('deployments', 'addresses.json'), `${JSON.stringify(references, null, 2)}\n`);
};
module.exports.tags = ['document'];
