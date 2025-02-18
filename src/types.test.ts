import { z } from 'zod';

import { type Chain, chainSchema } from './types';

describe('chainSchema', () => {
  const validChain: Chain = {
    alias: 'ethereum',
    decimals: 18,
    explorer: {
      api: {
        key: {
          hardhatEtherscanAlias: 'mainnet',
          required: true,
        },
        url: 'https://api.etherscan.io/api',
      },
      browserUrl: 'https://etherscan.io/',
    },
    id: '1',
    name: 'Ethereum',
    providers: [
      {
        alias: 'default',
        rpcUrl: 'https://cloudflare-eth.com',
      },
    ],
    symbol: 'ETH',
    testnet: false,
  };

  it('should accept a valid chain', () => {
    expect(() => chainSchema.parse(validChain)).not.toThrow();
  });

  it('should accept a symbol of 6 characters or less', () => {
    const validChainWithSymbol = {
      ...validChain,
      symbol: 'ABCDEF',
    };

    expect(() => chainSchema.parse(validChainWithSymbol)).not.toThrow();
  });

  it('should reject an empty symbol', () => {
    const invalidChain = {
      ...validChain,
      symbol: '',
    };

    expect(() => chainSchema.parse(invalidChain)).toThrow(z.ZodError);
  });

  it('should reject a symbol longer than 6 characters', () => {
    const invalidChain = {
      ...validChain,
      symbol: 'ABCDEFG',
    };

    expect(() => chainSchema.parse(invalidChain)).toThrow(z.ZodError);
  });
});
