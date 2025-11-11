import * as chainSupportData from '../data/chain-support.json';
import { CHAINS } from '../src/generated/chains';
import type { ChainSupport } from '../src/types';

const { chainsSupportedByMarket, chainsSupportedByOevAuctions }: ChainSupport = chainSupportData;

function isArrayAlphabeticallyOrdered(arr: string[]): boolean {
  const sortedArr = [...arr].sort();
  return arr.every((value, index) => value === sortedArr[index]);
}

function main(): void {
  const chainAliases = new Set(CHAINS.map((chain) => chain.alias));
  [chainsSupportedByMarket, chainsSupportedByOevAuctions].forEach((supportedChainAliases) => {
    supportedChainAliases.forEach((supportedChainAlias) => {
      if (!chainAliases.has(supportedChainAlias)) {
        throw new Error(`Supported chain with alias ${supportedChainAlias} does not exist`);
      }
    });
  });
  chainsSupportedByOevAuctions.forEach((chainAlias) => {
    if (!chainsSupportedByMarket.includes(chainAlias)) {
      throw new Error(`OEV auction-supported chain with alias ${chainAlias} is not market-supported`);
    }
  });

  const logs: string[] = [];

  for (const [arrayName, array] of Object.entries(chainSupportData)) {
    if (Array.isArray(array) && !isArrayAlphabeticallyOrdered(array as string[])) {
      logs.push(`Error: ${arrayName} is not alphabetically ordered`);
    }
  }

  if (logs.length > 0) {
    // eslint-disable-next-line no-console
    logs.forEach((log) => console.error(log));
    process.exit(1);
  }

  process.exit(0);
}

main();
