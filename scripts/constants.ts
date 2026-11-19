import type { GoAsyncOptions } from '@api3/commons';

export const goAsyncOptions: GoAsyncOptions = {
  retries: 5,
  attemptTimeoutMs: 10_000,
  totalTimeoutMs: 50_000,
  delay: {
    type: 'random',
    minDelayMs: 2000,
    maxDelayMs: 5000,
  },
};

export const skippedChainAliasesInOevAuctionHouseNativeCurrencyRateValidation: string[] = [];

// The creation tx of an undeterministic deployment cannot be fetched on these chains, so its deployed bytecode is
// compared with the local compilation output instead
export const chainAliasesWithoutHistoricalTransactionIndexing: string[] = ['ronin'];

export const skippedChainAliasesInOwnableCallForwarderConstructorArgumentVerification = [
  'apechain',
  'apechain-arbitrum-sepolia-testnet',
  'arbitrum',
  'arbitrum-sepolia-testnet',
  'avalanche',
  'avalanche-testnet',
  'base',
  'base-sepolia-testnet',
  'bob',
  'bob-sepolia-testnet',
  'bsc',
  'bsc-testnet',
  'core',
  'ethereum',
  'ethereum-sepolia-testnet',
  'fraxtal',
  'gnosis',
  'gnosis-testnet',
  'linea',
  'mantle',
  'mantle-sepolia-testnet',
  'optimism',
  'optimism-sepolia-testnet',
  'polygon',
  'polygon-sepolia-testnet',
  'ronin',
  'ronin-testnet',
  'sei',
  'sei-testnet',
  'soneium',
  'soneium-sepolia-testnet',
  'sonic',
  'taiko',
  'unichain',
  'unichain-sepolia-testnet',
  'zircuit',
];
