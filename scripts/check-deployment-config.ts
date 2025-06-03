import { chainsSupportedByMarket, chainsSupportedByOevAuctions } from '../data/chain-support.json';
import { CHAINS } from '../src/generated/chains';

function main() {
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
}

main();
