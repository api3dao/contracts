import {
  chainsSupportedByManagerMultisig,
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import { CHAINS } from '../src/index';

function main() {
  const chainAliases = new Set(CHAINS.map((chain) => chain.alias));
  [chainsSupportedByManagerMultisig, chainsSupportedByDapis, chainsSupportedByMarket, chainsSupportedByOevAuctions].map(
    (supportedChainAliases) => {
      supportedChainAliases.map((supportedChainAlias) => {
        if (!chainAliases.has(supportedChainAlias)) {
          throw new Error(`Supported chain with alias ${supportedChainAlias} does not exist`);
        }
      });
    }
  );
  chainsSupportedByDapis.map((chainSupportedByDapis) => {
    if (!chainsSupportedByManagerMultisig.includes(chainSupportedByDapis)) {
      throw new Error(`dAPI-supported chain with alias ${chainSupportedByDapis} is not manager multisig-supported`);
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
