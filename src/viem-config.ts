import { defineChain } from 'viem';

import { CHAINS } from './generated/chains';
import { type Chain } from './types';
import { toUpperSnakeCase } from './utils/strings';

interface CustomRpcUrls {
  readonly environment: {
    readonly http: string[];
  };
}

export function chainHttpRpcUrlName(chain: Chain) {
  return `API3_CHAINS_HTTP_RPC_URL_${toUpperSnakeCase(chain.alias)}`;
}

export function chains() {
  return CHAINS.map((chain) => {
    // All chains must have at least a default provider
    const defaultProvider = chain.providers.find((c) => c.alias === 'default')!;

    const envRpcUrl = process.env[chainHttpRpcUrlName(chain)];
    const environmentHttp = envRpcUrl ? [envRpcUrl] : [];

    const customRpcUrls: CustomRpcUrls = { environment: { http: environmentHttp } };

    return defineChain({
      id: Number(chain.id),
      name: chain.alias,
      network: chain.alias,
      nativeCurrency: {
        name: buildName(chain),
        symbol: chain.symbol,
        decimals: chain.decimals,
      },
      rpcUrls: {
        default: {
          http: [defaultProvider.rpcUrl!],
        },
        public: {
          http: [defaultProvider.rpcUrl!],
        },
        ...customRpcUrls,
      },
      blockExplorers: {
        default: {
          name: 'Explorer',
          url: chain.explorer.blockExplorerUrl,
        },
      },
    });
  });
}

function buildName(chain: Chain): string {
  if (chain.testnet) {
    const symbolWithoutPrefix = chain.symbol.replace(/^test\./, '');
    return `Testnet ${symbolWithoutPrefix}`;
  }
  return chain.symbol;
}
