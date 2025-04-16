import { CHAINS } from './generated/chains';
import { type Chain, type HardhatEtherscanConfig, type HardhatNetworksConfig } from './types';
import { toUpperSnakeCase } from './utils/strings';

export function getEnvVariableNames(): string[] {
  const apiKeyEnvNames = CHAINS.filter((chain) => chain.explorer?.api?.key?.required).map((chain) =>
    etherscanApiKeyName(chain)
  );

  const networkRpcUrlNames = CHAINS.map((chain) => networkHttpRpcUrlName(chain));

  return ['MNEMONIC', ...apiKeyEnvNames, ...networkRpcUrlNames];
}

export function etherscanApiKeyName(chain: Chain): string {
  return `ETHERSCAN_API_KEY_${toUpperSnakeCase(chain.alias)}`;
}

export function networkHttpRpcUrlName(chain: Chain): string {
  // TODO: we might want to synchronise this with the way viemConfig.chains() sources
  // env level RPC values. i.e. replacing the "HARHDAT_" prefix with something more generic
  // Latest suggestion is "API3_CHAINS_" instead.
  // See thread: https://github.com/api3dao/chains/pull/125/files#r1384859991
  return `HARDHAT_HTTP_RPC_URL_${toUpperSnakeCase(chain.alias)}`;
}

// https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify#multiple-api-keys-and-alternative-block-explorers
export function etherscan(): HardhatEtherscanConfig {
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line unicorn/prefer-type-error
    throw new Error('Cannot be called outside of a Node.js environment');
  }

  return CHAINS.reduce(
    (etherscan, chain) => {
      if (!chain.explorer || !chain.explorer.api) {
        return etherscan;
      }

      const apiKey = chain.explorer.api.key;

      const apiKeyEnvName = etherscanApiKeyName(chain);
      const apiKeyValue = apiKey.required ? (process.env[apiKeyEnvName] ?? 'NOT_FOUND') : 'DUMMY_VALUE';

      if (apiKey.hardhatEtherscanAlias) {
        etherscan.apiKey[apiKey.hardhatEtherscanAlias] = apiKeyValue;
        return etherscan;
      }

      etherscan.customChains.push({
        network: chain.alias,
        chainId: Number(chain.id),
        urls: {
          apiURL: chain.explorer.api.url,
          browserURL: chain.explorer.browserUrl,
        },
      });

      etherscan.apiKey[chain.alias] = apiKeyValue;

      return etherscan;
    },
    { apiKey: {}, customChains: [] } as HardhatEtherscanConfig
  );
}

export function networks(): HardhatNetworksConfig {
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line unicorn/prefer-type-error
    throw new Error('Cannot be called outside of a Node.js environment');
  }

  return CHAINS.reduce((networks, chain) => {
    const defaultProvider = chain.providers.find((p) => p.alias === 'default');
    const overrides = chain.hardhatConfigOverrides?.networks ?? {};

    networks[chain.alias] = {
      accounts: { mnemonic: process.env.MNEMONIC ?? '' },
      chainId: Number(chain.id),
      url: process.env[networkHttpRpcUrlName(chain)] ?? defaultProvider!.rpcUrl!,
      ...overrides,
    };
    return networks;
  }, {} as HardhatNetworksConfig);
}
