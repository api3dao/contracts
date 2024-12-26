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

async function main(): Promise<void> {
  const references: Record<string, Record<string, AddressLike>> = {
    GnosisSafeWithoutProxy: {},
    OwnableCallForwarder: {},
    AccessControlRegistry: {},
    Api3ServerV1: {},
    Api3ServerV1OevExtension: {},
    Api3ReaderProxyV1Factory: {},
    Api3MarketV2: {},
    OevAuctionHouse: {},
  };

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
      ...(chainsSupportedByDapis.includes(network)
        ? ['AccessControlRegistry', 'Api3ServerV1', 'Api3ServerV1OevExtension', 'Api3ReaderProxyV1Factory']
        : []),
      ...(chainsSupportedByMarket.includes(network) ? ['AirseekerRegistry', 'Api3MarketV2'] : []),
      ...(chainsSupportedByOevAuctions.includes(network) ? ['OevAuctionHouse'] : []),
    ];
    for (const contractName of contractNames) {
      const deployment = JSON.parse(fs.readFileSync(join('deployments', network, `${contractName}.json`), 'utf8'));
      references[contractName] = { ...references[contractName], [chainId]: deployment.address };
    }
  }
  fs.writeFileSync(join('deployments', 'addresses.json'), `${JSON.stringify(references, null, 2)}\n`);
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
