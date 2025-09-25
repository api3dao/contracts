import { CHAINS } from './generated/chains';
import {
  etherscan,
  blockscout,
  etherscanApiKeyName,
  getEnvVariableNames,
  networkHttpRpcUrlName,
  networks,
} from './hardhat-config';
import { toUpperSnakeCase } from './utils/strings';

const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules(); // Most important - it clears the cache
  process.env = { ...OLD_ENV }; // Make a copy
});

afterAll(() => {
  process.env = OLD_ENV; // Restore old environment
});

describe(getEnvVariableNames.name, () => {
  it('returns an array with expected env variables', () => {
    const apiKeyEnvName = etherscanApiKeyName();
    const networkRpcUrlNames = CHAINS.map((chain) => networkHttpRpcUrlName(chain));
    const expected = ['MNEMONIC', apiKeyEnvName, ...networkRpcUrlNames];
    expect(getEnvVariableNames()).toStrictEqual(expected);
  });
});

describe(blockscout.name, () => {
  beforeEach(() => {
    // eslint-disable-next-line jest/no-standalone-expect
    expect((global as any).window).toBeUndefined();
  });

  afterEach(() => {
    delete (global as any).window;
  });

  it('throws an error if called in a browser-like environment', () => {
    (global as any).window = {};
    expect(() => blockscout()).toThrow('Cannot be called outside of a Node.js environment');
  });

  describe('customChains', () => {
    it('ignores chains without an explorer API', () => {
      const { customChains } = blockscout();
      const ids = CHAINS.filter((c) => !c.verificationApi).map((c) => c.id);
      customChains.forEach((c) => {
        expect(ids).not.toContain(c.chainId);
      });
    });

    it('includes all other chains', () => {
      const { customChains } = blockscout();

      const chains = CHAINS.filter((c) => !!c.verificationApi);
      const chainsWithoutAlias = chains.filter((c) => c.verificationApi?.type);

      customChains.forEach((customChain) => {
        const chain = chainsWithoutAlias.find((c) => c.id === customChain.chainId.toString())!;
        expect(customChain).toStrictEqual({
          network: chain.alias,
          chainId: Number(chain.id),
          urls: {
            apiURL:
              chain.verificationApi?.type === 'blockscout' || chain.verificationApi?.type === 'other'
                ? chain.verificationApi?.url
                : '',
            browserURL: chain.blockExplorerUrl,
          },
        });
      });
    });
  });
});

describe(etherscan.name, () => {
  beforeEach(() => {
    // eslint-disable-next-line jest/no-standalone-expect
    expect((global as any).window).toBeUndefined();
  });

  afterEach(() => {
    delete (global as any).window;
  });

  it('throws an error if called in a browser-like environment', () => {
    (global as any).window = {};
    expect(() => etherscan()).toThrow('Cannot be called outside of a Node.js environment');
  });

  describe('customChains', () => {
    it('ignores chains without an explorer API', () => {
      const { customChains } = etherscan();
      const ids = CHAINS.filter((c) => !c.verificationApi).map((c) => c.id);
      customChains.forEach((c) => {
        expect(ids).not.toContain(c.chainId);
      });
    });
  });
});

describe(networks.name, () => {
  beforeEach(() => {
    // eslint-disable-next-line jest/no-standalone-expect
    expect((global as any).window).toBeUndefined();
  });

  afterEach(() => {
    delete (global as any).window;
  });

  it('throws an error if called in a browser-like environment', () => {
    (global as any).window = {};
    expect(() => networks()).toThrow('Cannot be called outside of a Node.js environment');
  });

  it('builds a network object for each chain', () => {
    const result = networks();
    expect(Object.keys(result)).toHaveLength(CHAINS.length);

    CHAINS.forEach((chain) => {
      const defaultProvider = chain.providers.find((p) => p.alias === 'default')!;
      const overrides = chain.hardhatConfigOverrides?.networks ?? {};

      expect(result[chain.alias]).toStrictEqual({
        accounts: { mnemonic: '' },
        chainId: Number(chain.id),
        url: defaultProvider.rpcUrl,
        ...overrides,
      });
    });
  });

  it('sets the mnemonic using the MNEMONIC env variable if it exists', () => {
    process.env.MNEMONIC = 'test test test test test test test test test test test junk';
    const result = networks();
    CHAINS.forEach((chain) => {
      const defaultProvider = chain.providers.find((p) => p.alias === 'default')!;
      const overrides = chain.hardhatConfigOverrides?.networks ?? {};

      expect(result[chain.alias]).toStrictEqual({
        accounts: { mnemonic: 'test test test test test test test test test test test junk' },
        chainId: Number(chain.id),
        url: defaultProvider.rpcUrl,
        ...overrides,
      });
    });
  });

  it('sets the provider URL using the chain alias env variable if it exists', () => {
    CHAINS.forEach((chain) => {
      const alias = toUpperSnakeCase(chain.alias);
      process.env[`HARDHAT_HTTP_RPC_URL_${alias}`] = `https://${chain.id}.xyz`;
    });

    const result = networks();

    CHAINS.forEach((chain) => {
      const overrides = chain.hardhatConfigOverrides?.networks ?? {};

      expect(result[chain.alias]).toStrictEqual({
        accounts: { mnemonic: '' },
        chainId: Number(chain.id),
        url: `https://${chain.id}.xyz`,
        ...overrides,
      });
    });
  });
});
