import { CHAINS } from './generated/chains.js';
import {
  assertNodeEnvironment,
  blockscoutApiUrl,
  blockscoutChains,
  credentials,
  etherscanApiKeyName,
  etherscanApiUrl,
  etherscanChains,
  networkHttpRpcUrl,
  networkHttpRpcUrlName,
} from './hardhat-config-shared.js';
import {
  type Chain,
  type HardhatEtherscanConfig,
  type HardhatBlockscoutConfig,
  type HardhatNetworksConfig,
} from './types.js';

export * as v3 from './hardhat-config-v3.js';

export { etherscanApiKeyName, networkHttpRpcUrl, networkHttpRpcUrlName };

export function getEnvVariableNames(): string[] {
  const apiKeyEnvName = etherscanApiKeyName();

  const networkRpcUrlNames = CHAINS.map((chain) => networkHttpRpcUrlName(chain));

  return ['MNEMONIC', 'KEYCARD_ACCOUNT', apiKeyEnvName, ...networkRpcUrlNames];
}

// https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify#multiple-api-keys-and-alternative-block-explorers
export function etherscan(): HardhatEtherscanConfig {
  assertNodeEnvironment();

  return {
    apiKey: process.env[etherscanApiKeyName()] ?? '',
    customChains: etherscanChains().map((chain) => ({
      network: chain.alias,
      chainId: Number(chain.id),
      urls: {
        apiURL: etherscanApiUrl(chain),
        browserURL: chain.blockExplorerUrl,
      },
    })),
  };
}

export function blockscout(): HardhatBlockscoutConfig {
  assertNodeEnvironment();

  return {
    enabled: true,
    customChains: blockscoutChains().map((chain) => ({
      network: chain.alias,
      chainId: Number(chain.id),
      urls: {
        apiURL: blockscoutApiUrl(chain),
        browserURL: chain.blockExplorerUrl,
      },
    })),
  };
}

export function networks(): HardhatNetworksConfig {
  assertNodeEnvironment();

  return CHAINS.reduce((networks, chain: Chain) => {
    const overrides = chain.hardhatConfigOverrides?.networks ?? {};

    networks[chain.alias] = {
      ...credentials(),
      chainId: Number(chain.id),
      url: networkHttpRpcUrl(chain),
      ...overrides,
    };
    return networks;
  }, {} as HardhatNetworksConfig);
}
