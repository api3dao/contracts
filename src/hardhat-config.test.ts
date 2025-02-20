import { CHAINS } from './generated/chains';
import { etherscan, etherscanApiKeyName, getEnvVariableNames, networkHttpRpcUrlName, networks } from './hardhat-config';
import { type Chain } from './types';
import { toUpperSnakeCase } from './utils/strings';

function getRandomChain(): Chain {
  return CHAINS[Math.floor(Math.random() * CHAINS.length)]!;
}

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
    const apiKeyEnvNames = CHAINS.filter((chain) => chain.explorer?.api?.key?.required).map((chain) =>
      etherscanApiKeyName(chain)
    );
    const networkRpcUrlNames = CHAINS.map((chain) => networkHttpRpcUrlName(chain));
    const expected = ['MNEMONIC', ...apiKeyEnvNames, ...networkRpcUrlNames];
    expect(getEnvVariableNames()).toStrictEqual(expected);
  });
});

describe(etherscanApiKeyName.name, () => {
  it('returns the expected Etherscan API key name', () => {
    const randomChain = getRandomChain();
    const expected = `ETHERSCAN_API_KEY_${toUpperSnakeCase(randomChain!.alias)}`;
    expect(etherscanApiKeyName(randomChain!)).toStrictEqual(expected);
  });
});

describe(networkHttpRpcUrlName.name, () => {
  it('returns the expected HTTP RPC URL name', () => {
    const randomChain = getRandomChain();
    const expected = `ETHERSCAN_API_KEY_${toUpperSnakeCase(randomChain!.alias)}`;
    expect(etherscanApiKeyName(randomChain!)).toStrictEqual(expected);
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
    it('ignores chains without an explorer', () => {
      const { customChains } = etherscan();
      const ids = CHAINS.filter((c) => !c.explorer).map((c) => c.id);
      customChains.forEach((c) => {
        expect(ids).not.toContain(c.chainId);
      });
    });

    it('ignores chains without an explorer API', () => {
      const { customChains } = etherscan();
      const ids = CHAINS.filter((c) => !!c.explorer && !c.explorer.api).map((c) => c.id);
      customChains.forEach((c) => {
        expect(ids).not.toContain(c.chainId);
      });
    });

    it('ignores chains with a hardhat etherscan alias', () => {
      const { customChains } = etherscan();
      const chains = CHAINS.filter((c) => !!c.explorer && !!c.explorer.api);
      const ids = chains.filter((c) => c.explorer.api!.key.hardhatEtherscanAlias).map((c) => c.id);

      customChains.forEach((c) => {
        expect(ids).not.toContain(c.chainId);
      });
    });

    it('includes all other chains', () => {
      const { customChains } = etherscan();
      const chains = CHAINS.filter((c) => !!c.explorer && !!c.explorer.api);
      const chainsWithoutAlias = chains.filter((c) => !c.explorer.api!.key.hardhatEtherscanAlias);

      customChains.forEach((customChain) => {
        const chain = chainsWithoutAlias.find((c) => c.id === customChain.chainId.toString())!;
        expect(customChain).toStrictEqual({
          network: chain.alias,
          chainId: Number(chain.id),
          urls: {
            apiURL: chain.explorer.api!.url,
            browserURL: chain.explorer.browserUrl,
          },
        });
      });
    });
  });

  describe('apiKey', () => {
    it('ignores chains without an explorer', () => {
      const { apiKey } = etherscan();
      const aliases = CHAINS.filter((c) => !c.explorer).map((c) => c.alias);
      Object.keys(apiKey).forEach((key) => {
        expect(aliases).not.toContain(key);
      });
    });

    it('ignores chains without an explorer API', () => {
      const { apiKey } = etherscan();
      const aliases = CHAINS.filter((c) => !!c.explorer && !c.explorer.api).map((c) => c.alias);
      Object.keys(apiKey).forEach((key) => {
        expect(aliases).not.toContain(key);
      });
    });

    it('sets the API key value to dummy value for chains with a hardhat alias', () => {
      const chains = CHAINS.filter((c) => !!c.explorer && !!c.explorer.api);
      const chainsWithAlias = chains.filter((c) => {
        return (
          !!c.explorer.api!.key.hardhatEtherscanAlias && // has a hardhatEtherscanAlias
          !c.explorer.api!.key.required
        ); // but not required
      });

      const { apiKey } = etherscan();
      chainsWithAlias.forEach((chain) => {
        expect(apiKey[chain.explorer.api!.key.hardhatEtherscanAlias!]).toBe('DUMMY_VALUE');
      });
    });

    it('sets the API key value to not found for chains with a hardhat alias', () => {
      const chains = CHAINS.filter((c) => !!c.explorer && !!c.explorer.api);
      const chainsWithAlias = chains.filter((c) => {
        return (
          !!c.explorer.api!.key.hardhatEtherscanAlias && // has a hardhatEtherscanAlias
          c.explorer.api!.key.required
        ); // and is required
      });

      const { apiKey } = etherscan();
      chainsWithAlias.forEach((chain) => {
        expect(apiKey[chain.explorer.api!.key.hardhatEtherscanAlias!]).toBe('NOT_FOUND');
      });
    });

    it('sets the API value to the env variable value for chains with a hardhat alias', () => {
      const chains = CHAINS.filter((c) => !!c.explorer && !!c.explorer.api);
      const chainsWithAlias = chains.filter((c) => {
        return (
          !!c.explorer.api!.key.hardhatEtherscanAlias && // has a hardhatEtherscanAlias
          c.explorer.api!.key.required
        ); // and is required
      });

      chainsWithAlias.forEach((chain) => {
        const envKey = etherscanApiKeyName(chain);
        process.env[envKey] = `api-key-${chain.id}`;
      });

      // needs to be called AFTER env values are set
      const { apiKey } = etherscan();

      chainsWithAlias.forEach((chain) => {
        expect(apiKey[chain.explorer.api!.key.hardhatEtherscanAlias!]).toBe(`api-key-${chain.id}`);
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
