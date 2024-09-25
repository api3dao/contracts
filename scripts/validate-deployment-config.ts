import { CHAINS } from '@api3/chains';
import { ethers } from 'hardhat';

import {
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import managerMultisigAddresses from '../data/manager-multisig.json';

function main() {
  const chainAliases = new Set(CHAINS.map((chain) => chain.alias));
  const records: Record<string, string[]> = {
    managerMultisigAddresses: Object.keys(managerMultisigAddresses),
    chainsSupportedByDapis,
    chainsSupportedByMarket,
    chainsSupportedByOevAuctions,
  };

  Object.entries(records).forEach(([fieldName, supportedChainAliases]) => {
    supportedChainAliases.forEach((supportedChainAlias) => {
      if (!chainAliases.has(supportedChainAlias)) {
        throw new Error(`Supported chain in ${fieldName} with alias ${supportedChainAlias} does not exist`);
      }
    });
    if (new Set(supportedChainAliases).size !== supportedChainAliases.length) {
      throw new Error(`Duplicates found in ${fieldName}`);
    }
    const sortedSupportedChainAliases = [...supportedChainAliases].sort();
    if (JSON.stringify(supportedChainAliases) !== JSON.stringify(sortedSupportedChainAliases)) {
      throw new Error(`${fieldName} is not sorted`);
    }
  });

  Object.entries(managerMultisigAddresses).map(([alias, address]) => {
    if (!ethers.isAddress(address)) {
      throw new Error(`Manager multisig address of ${alias}, ${address as string}, is not valid`);
    }
  });
  chainsSupportedByDapis.map((chainsSupportedByDapi) => {
    if (!Object.keys(managerMultisigAddresses).includes(chainsSupportedByDapi)) {
      throw new Error(
        `dAPI-supported chain with alias ${chainsSupportedByDapi} does not have a manager multisig address`
      );
    }
  });
  chainsSupportedByMarket.map((chainSupportedByMarket) => {
    if (!chainsSupportedByDapis.includes(chainSupportedByMarket)) {
      throw new Error(`Market-supported chain with alias ${chainSupportedByMarket} is not dAPI-supported`);
    }
  });
  chainsSupportedByOevAuctions.map((chainSupportedByOevAuctions) => {
    if (!chainsSupportedByDapis.includes(chainSupportedByOevAuctions)) {
      throw new Error(`OEV auction-supported chain with alias ${chainSupportedByOevAuctions} is not dAPI-supported`);
    }
  });
}

main();
