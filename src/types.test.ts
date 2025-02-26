import { z, ZodError } from 'zod';

import { type Chain, chainAlias, chainSchema, dappSchema } from './types';

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

describe('chainAlias', () => {
  it('should accept valid chain aliases', () => {
    expect(() => chainAlias.parse('ethereum')).not.toThrow();
    expect(() => chainAlias.parse('bsc')).not.toThrow();
    expect(() => chainAlias.parse('mantle')).not.toThrow();
  });

  it('should reject chain aliases not in the CHAINS array', () => {
    expect(() => chainAlias.parse('Mantle')).toThrow(
      new ZodError([
        {
          code: 'custom',
          message: 'Invalid chain alias: Mantle',
          path: [],
        },
      ])
    );
    expect(() => chainAlias.parse('ethereum-mainnet')).toThrow(
      new ZodError([
        {
          code: 'custom',
          message: 'Invalid chain alias: ethereum-mainnet',
          path: [],
        },
      ])
    );
  });
});

describe('dappSchema', () => {
  it('accepts a value with a single alias without a tag', () => {
    const validSingleAliasDapp = {
      aliases: {
        'single-dapp': {
          chains: ['ethereum', 'bsc'],
        },
      },
      name: 'Single Alias DApp',
      homepageUrl: 'https://example.com',
    };

    expect(() => dappSchema.parse(validSingleAliasDapp)).not.toThrow();
  });

  it('accepts a value with multiple aliases with tags', () => {
    const validMultipleAliasesDapp = {
      aliases: {
        'alias-1': {
          chains: ['ethereum'],
          tag: 'Ethereum Market',
        },
        'alias-2': {
          chains: ['bsc'],
          tag: 'BSC Market',
        },
      },
      name: 'Multiple Aliases DApp',
      homepageUrl: 'https://example.com',
    };

    expect(() => dappSchema.parse(validMultipleAliasesDapp)).not.toThrow();
  });

  it('throws on value with multiple aliases without tags', () => {
    const invalidMultipleAliasesDapp = {
      aliases: {
        'multi-dapp-1': {
          chains: ['ethereum'],
        },
        'multi-dapp-2': {
          chains: ['bsc'],
          tag: 'BSC Market',
        },
      },
      name: 'Invalid Multiple Aliases DApp',
      homepageUrl: 'https://example.com',
    };

    expect(() => dappSchema.parse(invalidMultipleAliasesDapp)).toThrow(
      new ZodError([
        {
          code: 'custom',
          message: 'Property "tag" is required for dApps with multiple aliases',
          path: ['aliases'],
        },
      ])
    );
  });

  it('accepts valid chain IDs and throws on invalid ones', () => {
    const validChainsDapp = {
      aliases: {
        'valid-chains': {
          chains: ['ethereum', 'bsc', 'polygon'],
        },
      },
      name: 'Valid Chains DApp',
      homepageUrl: 'https://example.com',
    };
    expect(() => dappSchema.parse(validChainsDapp)).not.toThrow();

    const invalidChainsDapp = {
      aliases: {
        'invalid-chains': {
          chains: ['ethereum', 'invalid-chain', 'polygon'],
        },
      },
      name: 'Invalid Chains DApp',
      homepageUrl: 'https://example.com',
    };
    expect(() => dappSchema.parse(invalidChainsDapp)).toThrow(
      new ZodError([
        {
          code: 'custom',
          message: 'Invalid chain alias: invalid-chain',
          path: ['aliases', 'invalid-chains', 'chains', 1],
        },
      ])
    );
  });
});
