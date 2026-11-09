import * as fs from 'node:fs';
import { join } from 'node:path';

import { type AddressLike, getAddress } from 'ethers';

import chainSupportData from '../../data/chain-support.json' with { type: 'json' };
import { CHAINS } from '../../src/generated/chains.js';
import type { ChainSupport } from '../../src/types.js';

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
      // hardhat-deploy v2 records addresses in lowercase, while the published addresses are checksummed
      references[contractName] = { ...references[contractName], [chainId!]: getAddress(deployment.address) };
    }
  }
  return `${JSON.stringify(references, null, 2)}\n`;
}

export { getDeploymentAddresses };
