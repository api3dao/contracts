import { CHAINS } from './generated/chains.js';
import {
  assertNodeEnvironment,
  blockscoutApiUrl,
  blockscoutChains,
  credentials,
  ETHERSCAN_API_URL,
  etherscanApiKeyName,
  etherscanChains,
  networkHttpRpcUrl,
  SOURCIFY_API_URL,
} from './hardhat-config-shared.js';
import {
  type Chain,
  type HardhatV3ChainDescriptorsConfig,
  type HardhatV3NetworksConfig,
  type HardhatV3VerifyConfig,
} from './types.js';

export function networks(): HardhatV3NetworksConfig {
  assertNodeEnvironment();

  return CHAINS.reduce((networks, chain: Chain) => {
    const overrides = chain.hardhatConfigOverrides?.networks ?? {};

    networks[chain.alias] = {
      type: 'http',
      ...credentials(),
      chainId: Number(chain.id),
      url: networkHttpRpcUrl(chain),
      ...overrides,
    };
    return networks;
  }, {} as HardhatV3NetworksConfig);
}

export function chainDescriptors(): HardhatV3ChainDescriptorsConfig {
  assertNodeEnvironment();

  const descriptors: HardhatV3ChainDescriptorsConfig = {};

  for (const chain of etherscanChains()) {
    descriptors[chain.id] = {
      name: chain.name,
      blockExplorers: {
        etherscan: {
          name: 'Etherscan',
          url: chain.blockExplorerUrl,
          // Bare endpoint: hardhat-verify appends `chainid` itself.
          apiUrl: ETHERSCAN_API_URL,
        },
      },
    };
  }

  for (const chain of blockscoutChains()) {
    descriptors[chain.id] = {
      name: chain.name,
      blockExplorers: {
        blockscout: {
          name: 'Blockscout',
          url: chain.blockExplorerUrl,
          apiUrl: blockscoutApiUrl(chain),
        },
      },
    };
  }

  return descriptors;
}

export function verify(): HardhatV3VerifyConfig {
  assertNodeEnvironment();

  return {
    etherscan: {
      apiKey: process.env[etherscanApiKeyName()] ?? '',
      enabled: true,
    },
    blockscout: {
      enabled: true,
    },
    sourcify: {
      apiUrl: SOURCIFY_API_URL,
      enabled: true,
    },
  };
}
