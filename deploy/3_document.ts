import * as fs from 'node:fs';
import { join } from 'node:path';

import { CHAINS } from '@api3/chains';
import type { AddressLike } from 'ethers';
import { config } from 'hardhat';

import {
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import managerMultisigAddresses from '../data/manager-multisig.json';

module.exports = () => {
  const references: Record<string, Record<string, AddressLike>> = {};

  const networks = new Set([
    ...Object.keys(managerMultisigAddresses),
    ...chainsSupportedByDapis,
    ...chainsSupportedByMarket,
    ...chainsSupportedByOevAuctions,
  ]);

  for (const network of networks) {
    const chainId = config.networks[network]!.chainId!;
    const contractNames = [
      ...(Object.keys(managerMultisigAddresses).includes(network) ? ['OwnableCallForwarder'] : []),
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
  fs.writeFileSync(
    join('deployments', 'manager-multisig-addresses.json'),
    `${JSON.stringify(
      Object.entries(managerMultisigAddresses).reduce((acc, [alias, address]) => {
        return { ...acc, [CHAINS.find((chain) => chain.alias === alias)!.id]: address };
      }, {}),
      null,
      2
    )}\n`
  );
};
module.exports.tags = ['document'];
