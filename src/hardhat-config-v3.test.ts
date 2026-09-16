import { CHAINS } from './generated/chains.js';
import { chainDescriptors, networks, verify } from './hardhat-config-v3.js';
import { networks as networksV2 } from './hardhat-config.js';

const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...OLD_ENV };
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe(networks.name, () => {
  beforeEach(() => {
    // eslint-disable-next-line jest/no-standalone-expect
    expect((global as any).window).toBeUndefined();
  });

  afterEach(() => {
    delete (global as any).window;
  });

  it('throws if called outside of a Node.js environment', () => {
    (global as any).window = {};
    expect(() => networks()).toThrow('Cannot be called outside of a Node.js environment');
  });

  it('tags every network with the http type that Hardhat 3 requires', () => {
    const result = networks();
    expect(Object.keys(result)).toHaveLength(CHAINS.length);
    for (const network of Object.values(result)) {
      expect(network.type).toBe('http');
    }
  });

  it('differs from the Hardhat 2 shape only by the type field', () => {
    const v3 = networks();
    const v2 = networksV2();
    for (const [alias, network] of Object.entries(v3)) {
      const { type: _type, ...rest } = network;
      expect(rest).toStrictEqual(v2[alias]);
    }
  });

  it('uses the mnemonic unless a keycard account is set', () => {
    process.env.MNEMONIC = 'test mnemonic';
    delete process.env.KEYCARD_ACCOUNT;
    expect(networks()[CHAINS[0]!.alias]!.accounts).toStrictEqual({ mnemonic: 'test mnemonic' });

    process.env.KEYCARD_ACCOUNT = '0xabc';
    const withKeycard = networks()[CHAINS[0]!.alias]!;
    expect(withKeycard.keycardAccount).toBe('0xabc');
    expect(withKeycard.accounts).toBeUndefined();
  });

  it('prefers the chain specific RPC URL environment variable', () => {
    const chain = CHAINS[0]!;
    process.env[`HARDHAT_HTTP_RPC_URL_${chain.alias.toUpperCase().replaceAll('-', '_')}`] = 'https://example.com';
    expect(networks()[chain.alias]!.url).toBe('https://example.com');
  });
});

describe(chainDescriptors.name, () => {
  it('is keyed by chain ID rather than by alias', () => {
    const result = chainDescriptors();
    for (const chainId of Object.keys(result)) {
      expect(CHAINS.some((chain) => chain.id === chainId)).toBe(true);
    }
  });

  it('covers every chain with a block explorer, but not the sourcify only ones', () => {
    // Sourcify needs no block explorer endpoint, so those chains get no descriptor.
    const expected = CHAINS.filter((chain) =>
      ['etherscan', 'blockscout', 'other'].includes(chain.verificationApi?.type ?? '')
    );
    expect(Object.keys(chainDescriptors())).toHaveLength(expected.length);
    expect(CHAINS.some((chain) => chain.verificationApi?.type === 'sourcify')).toBe(true);
  });

  it('routes etherscan chains through the Etherscan V2 endpoint', () => {
    const chain = CHAINS.find((chain) => chain.verificationApi?.type === 'etherscan')!;
    expect(chainDescriptors()[chain.id]!.blockExplorers.etherscan).toStrictEqual({
      name: 'Etherscan',
      url: chain.blockExplorerUrl,
      apiUrl: `https://api.etherscan.io/v2/api?chainid=${chain.id}`,
    });
  });

  it('routes blockscout chains to their own API URL', () => {
    const chain = CHAINS.find((chain) => chain.verificationApi?.type === 'blockscout')!;
    expect(chainDescriptors()[chain.id]!.blockExplorers.blockscout).toStrictEqual({
      name: 'Blockscout',
      url: chain.blockExplorerUrl,
      apiUrl: (chain.verificationApi as any).url,
    });
  });
});

describe(verify.name, () => {
  it('reads the Etherscan API key from the environment', () => {
    process.env.ETHERSCAN_API_KEY = 'some-key';
    expect(verify().etherscan).toStrictEqual({ apiKey: 'some-key', enabled: true });
  });

  it('enables all three verification providers', () => {
    const result = verify();
    expect(result.etherscan.enabled).toBe(true);
    expect(result.blockscout.enabled).toBe(true);
    expect(result.sourcify).toStrictEqual({ apiUrl: 'https://sourcify.dev/server', enabled: true });
  });
});
