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
  it('accepts a single alias when multiAliased is false', () => {
    const dappWithSingleAlias = {
      aliases: {
        'alias-1': {
          chains: ['ethereum'],
          title: 'Single DApp',
        },
      },
      multiAliased: false,
      homepageUrl: 'https://example.com',
    };

    expect(() => dappSchema.parse(dappWithSingleAlias)).not.toThrow();
  });

  it('honors the multiAliased option', () => {
    const dappWithSingleAlias = {
      aliases: {
        'alias-1': {
          chains: ['ethereum'],
          title: 'dApp ETH market',
          description: 'ETH market description',
        },
        'alias-2': {
          chains: ['ethereum'],
          title: 'dApp USDT market',
          description: 'USDT market description',
        },
      },
      homepageUrl: 'https://example.com',
    };

    expect(() => dappSchema.parse({ ...dappWithSingleAlias, multiAliased: false })).toThrow(
      new ZodError([
        {
          code: 'custom',
          message: "Multiple aliases are allowed only when 'multiAliased' is enabled",
          path: ['aliases'],
        },
      ])
    );
    expect(() => dappSchema.parse({ ...dappWithSingleAlias, multiAliased: true })).not.toThrow();
  });

  it('enforces alias description when multiAliased is set to true', () => {
    const dapp = {
      aliases: {
        alias: {
          chains: ['ethereum'],
          title: 'Some dApp',
        },
      },
      multiAliased: true,
      homepageUrl: 'https://example.com',
    };
    expect(() => dappSchema.parse(dapp)).toThrow(
      new ZodError([
        {
          code: 'custom',
          message: 'Description is required for multiple aliased dApps',
          path: ['aliases', 'alias'],
        },
      ])
    );
  });

  it('accepts valid chain IDs and throws on invalid ones', () => {
    const validChainsDapp = {
      aliases: {
        'valid-chains': {
          chains: ['ethereum', 'bsc', 'polygon'],
          title: 'Valid Chains DApp',
        },
      },
      multiAliased: false,
      homepageUrl: 'https://example.com',
    };
    expect(() => dappSchema.parse(validChainsDapp)).not.toThrow();

    const invalidChainsDapp = {
      aliases: {
        'invalid-chains': {
          chains: ['ethereum', 'invalid-chain', 'polygon'],
          title: 'Invalid Chains DApp',
        },
      },
      multiAliased: false,
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
