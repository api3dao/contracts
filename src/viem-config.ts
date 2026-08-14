// viem >=2.55.10 marks its emitted `_types/` folder as `{"type":"module"}` (wevm/viem#4903), so TypeScript reports
// TS1479 for this import. The require it emits is fine — viem still ships a CommonJS entry point (`_cjs/index.js`).
// @ts-expect-error viem's declarations are ESM-only; the CommonJS entry point resolves correctly
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
          url: chain.blockExplorerUrl,
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
