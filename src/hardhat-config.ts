import { CHAINS } from './generated/chains';
import {
  type Chain,
  type HardhatEtherscanConfig,
  type HardhatBlockscoutConfig,
  type HardhatNetworksConfig,
} from './types';
import { toUpperSnakeCase } from './utils/strings';

export function getEnvVariableNames(): string[] {
  const apiKeyEnvName = etherscanApiKeyName();

  const networkRpcUrlNames = CHAINS.map((chain) => networkHttpRpcUrlName(chain));

  return ['MNEMONIC', 'KEYCARD_ACCOUNT', apiKeyEnvName, ...networkRpcUrlNames];
}

export function etherscanApiKeyName(): string {
  return `ETHERSCAN_API_KEY`;
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

  return {
    apiKey: process.env[etherscanApiKeyName()] ?? '',
    customChains: CHAINS.filter((chain) => chain.verificationApi?.type === 'etherscan').map((chain) => ({
      network: chain.alias,
      chainId: Number(chain.id),
      urls: {
        apiURL: `https://api.etherscan.io/v2/api?chainid=${chain.id}`,
        browserURL: chain.blockExplorerUrl,
      },
    })),
  };
}

export function blockscout(): HardhatBlockscoutConfig {
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line unicorn/prefer-type-error
    throw new Error('Cannot be called outside of a Node.js environment');
  }

  return {
    enabled: true,
    customChains: CHAINS.filter(
      (chain) => chain.verificationApi?.type === 'blockscout' || chain.verificationApi?.type === 'other'
    ).map((chain) => ({
      network: chain.alias,
      chainId: Number(chain.id),
      urls: {
        apiURL:
          chain.verificationApi?.type === 'blockscout' || chain.verificationApi?.type === 'other'
            ? chain.verificationApi?.url
            : '',
        browserURL: chain.blockExplorerUrl,
      },
    })),
  };
}

export function networks(): HardhatNetworksConfig {
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line unicorn/prefer-type-error
    throw new Error('Cannot be called outside of a Node.js environment');
  }

  const credentials = process.env.KEYCARD_ACCOUNT
    ? { keycardAccount: process.env.KEYCARD_ACCOUNT }
    : { accounts: { mnemonic: process.env.MNEMONIC ?? '' } };

  return CHAINS.reduce((networks, chain) => {
    const defaultProvider = chain.providers.find((p) => p.alias === 'default');
    const overrides = chain.hardhatConfigOverrides?.networks ?? {};

    networks[chain.alias] = {
      ...credentials,
      chainId: Number(chain.id),
      url: process.env[networkHttpRpcUrlName(chain)] ?? defaultProvider!.rpcUrl!,
      ...overrides,
    };
    return networks;
  }, {} as HardhatNetworksConfig);
}
