import * as fs from 'node:fs';
import { join } from 'node:path';

import type { AddressLike } from 'ethers';

import * as chainSupportData from '../../data/chain-support.json';
import { CHAINS } from '../../src/generated/chains';
import type { ChainSupport } from '../../src/types';

const { chainsSupportedByMarket, chainsSupportedByOevAuctions }: ChainSupport = chainSupportData;

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

  const networks = new Set([...chainsSupportedByMarket, ...chainsSupportedByOevAuctions]);

  for (const network of networks) {
    const chainId = CHAINS.find((chain) => chain.alias === network)?.id;
    const contractNames = [
      ...(chainsSupportedByMarket.includes(network)
        ? [
            'GnosisSafeWithoutProxy',
            'OwnableCallForwarder',
            'AccessControlRegistry',
            'Api3ServerV1',
            'Api3ServerV1OevExtension',
            'Api3ReaderProxyV1Factory',
            'AirseekerRegistry',
            'Api3MarketV2',
          ]
        : []),
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
