import * as chainSupport from '../data/chain-support.json';
import { CHAINS } from '../src/generated/chains';

function isArrayAlphabeticallyOrdered(arr: string[]): boolean {
  const sortedArr = [...arr].sort();
  return arr.every((value, index) => value === sortedArr[index]);
}

function main(): void {
  const chainAliases = new Set(CHAINS.map((chain) => chain.alias));
  [chainSupport.chainsSupportedByMarket, chainSupport.chainsSupportedByOevAuctions].forEach((supportedChainAliases) => {
    supportedChainAliases.forEach((supportedChainAlias) => {
      if (!chainAliases.has(supportedChainAlias)) {
        throw new Error(`Supported chain with alias ${supportedChainAlias} does not exist`);
      }
    });
  });
  chainSupport.chainsSupportedByOevAuctions.forEach((chainAlias) => {
    if (!chainSupport.chainsSupportedByMarket.includes(chainAlias)) {
      throw new Error(`OEV auction-supported chain with alias ${chainAlias} is not market-supported`);
    }
  });

  const logs: string[] = [];

  for (const [arrayName, array] of Object.entries(chainSupport)) {
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
