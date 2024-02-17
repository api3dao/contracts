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
  [
    Object.keys(managerMultisigAddresses),
    chainsSupportedByDapis,
    chainsSupportedByMarket,
    chainsSupportedByOevAuctions,
  ].map((supportedChainAliases) => {
    supportedChainAliases.map((supportedChainAlias) => {
      if (!chainAliases.has(supportedChainAlias)) {
        throw new Error(`Supported chain with alias ${supportedChainAlias} does not exist`);
      }
    });
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
