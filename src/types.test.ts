import { z, ZodError } from 'zod';

import { type Chain, chainAlias, chainSchema, chainProviderSchema, chainProvidersSchema, dappSchema } from './types';

describe('chainSchema', () => {
  const validChain: Chain = {
    alias: 'ethereum',
    blockExplorerUrl: 'https://etherscan.io/',
    decimals: 18,
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
    verificationApi: {
      type: 'etherscan',
    },
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
    const resultInvalidFormat = chainAlias.safeParse('Mantle');
    expect(resultInvalidFormat.error).toBeInstanceOf(ZodError);
    expect(resultInvalidFormat.error?.issues).toStrictEqual([
      {
        origin: 'string',
        code: 'invalid_format',
        format: 'regex',
        pattern: '/^[\\da-z-]+$/',
        path: [],
        message: 'Invalid string: must match pattern /^[\\da-z-]+$/',
      },
      { code: 'custom', path: [], message: 'Invalid chain alias: Mantle' },
    ]);

    const resultInvalidChainAlias = chainAlias.safeParse('ethereum-mainnet');
    expect(resultInvalidChainAlias.error).toBeInstanceOf(ZodError);
    expect(resultInvalidChainAlias.error?.issues).toStrictEqual([
      { code: 'custom', path: [], message: 'Invalid chain alias: ethereum-mainnet' },
    ]);
  });
});

describe('dappSchema', () => {
  it('accepts valid chain IDs and throws on invalid ones', () => {
    const validChainsDapp = {
      aliases: {
        'valid-chains': {
          chains: ['ethereum', 'bsc', 'polygon'],
          title: 'Valid Chains DApp',
        },
      },
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
      homepageUrl: 'https://example.com',
    };
    expect(() => dappSchema.parse(invalidChainsDapp)).toThrow(
      new ZodError([
        {
          code: 'custom',
          path: ['aliases', 'invalid-chains', 'chains', 1],
          message: 'Invalid chain alias: invalid-chain',
        },
      ])
    );
  });
});

describe('chainProviderSchema', () => {
  it('should accept a valid provider with rpcUrl', () => {
    const validProvider = {
      alias: 'default',
      rpcUrl: 'https://dummy-rpc.com',
    };
    expect(() => chainProviderSchema.parse(validProvider)).not.toThrow();
  });

  it('should accept a valid provider with homepageUrl', () => {
    const validProvider = {
      alias: 'paid-provider',
      homepageUrl: 'https://dummy-homepage.com',
    };
    expect(() => chainProviderSchema.parse(validProvider)).not.toThrow();
  });

  it('should reject an invalid homepageUrl', () => {
    const invalidProvider = {
      alias: 'paid-provider',
      homepageUrl: 'dummy-homepage.com',
    };
    expect(() => chainProviderSchema.parse(invalidProvider)).toThrow(
      new ZodError([
        {
          code: 'invalid_format',
          format: 'url',
          path: ['homepageUrl'],
          message: 'Invalid URL',
        },
      ])
    );
  });

  it('should reject an invalid rpcUrl', () => {
    const invalidProvider = {
      alias: 'paid-provider',
      rpcUrl: 'dummy-rpc.com',
    };
    expect(() => chainProviderSchema.parse(invalidProvider)).toThrow(
      new ZodError([
        {
          code: 'invalid_format',
          format: 'url',
          path: ['rpcUrl'],
          message: 'Invalid URL',
        },
      ])
    );
  });

  it('should reject an invalid provider if either rpcUrl or homepageUrl is missing', () => {
    const invalidProvider = {
      alias: 'default',
    };
    expect(() => chainProviderSchema.parse(invalidProvider)).toThrow(
      new ZodError([
        {
          code: 'custom',
          path: [],
          message: 'rpcUrl or homepageUrl is required',
        },
      ])
    );
  });
});

describe('chainProvidersSchema', () => {
  it('should accept valid providers', () => {
    const validProviders = [
      { alias: 'default', rpcUrl: 'https://dummy-rpc.com' },
      { alias: 'public', rpcUrl: 'https://public-rpc.com' },
    ];
    expect(() => chainProvidersSchema.parse(validProviders)).not.toThrow();
  });

  it('should reject if no provider with alias "default" is present', () => {
    const invalidProviders = [{ alias: 'public', rpcUrl: 'https://public-rpc.com' }];
    expect(() => chainProvidersSchema.parse(invalidProviders)).toThrow(
      new ZodError([
        {
          code: 'custom',
          path: [],
          message: "a provider with alias 'default' is required",
        },
      ])
    );
  });

  it('should reject if there are duplicate aliases', () => {
    const invalidProviders = [
      { alias: 'default', rpcUrl: 'https://dummy-rpc.com' },
      { alias: 'default', rpcUrl: 'https://another-rpc.com' },
    ];
    expect(() => chainProvidersSchema.parse(invalidProviders)).toThrow(
      new ZodError([
        {
          code: 'custom',
          path: [],
          message: "cannot contain duplicate 'alias' values",
        },
      ])
    );
  });

  it('should reject if "default" or "public" provider does not have rpcUrl', () => {
    const invalidProviders = [
      { alias: 'default', homepageUrl: 'https://dummy-homepage.com' },
      { alias: 'public', homepageUrl: 'https://public-homepage.com' },
    ];
    expect(() => chainProvidersSchema.parse(invalidProviders)).toThrow(
      new ZodError([
        {
          code: 'custom',
          path: [0, 'rpcUrl'],
          message: "providers with alias 'default' or 'public' must also have an 'rpcUrl'",
        },
        {
          code: 'custom',
          path: [1, 'rpcUrl'],
          message: "providers with alias 'default' or 'public' must also have an 'rpcUrl'",
        },
      ])
    );
  });
});
