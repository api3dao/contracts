import * as fs from 'node:fs';
import { join } from 'node:path';

import type { AddressLike } from 'ethers';

import {
  chainsSupportedByManagerMultisig,
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../../data/chain-support.json';
import { CHAINS } from '../../src/generated/chains';

function getDeploymentAddresses() {
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
    const chainId = CHAINS.find((chain) => chain.alias === network)?.id;
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
      references[contractName] = { ...references[contractName], [chainId!]: deployment.address };
    }
  }
  return `${JSON.stringify(references, null, 2)}\n`;
}

export { getDeploymentAddresses };
