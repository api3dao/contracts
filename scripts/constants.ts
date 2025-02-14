import type { GoAsyncOptions } from '@api3/promise-utils';

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

export const skippedChainAliasesInOevAuctionHouseNativeCurrencyRateValidation = ['conflux'];
