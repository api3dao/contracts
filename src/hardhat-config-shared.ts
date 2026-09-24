import { CHAINS } from './generated/chains.js';
import { type Chain } from './types.js';
import { toUpperSnakeCase } from './utils/strings.js';

export function assertNodeEnvironment(): void {
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line unicorn/prefer-type-error
    throw new Error('Cannot be called outside of a Node.js environment');
  }
}

export function etherscanApiKeyName(): string {
  return `ETHERSCAN_API_KEY`;
}

export function networkHttpRpcUrlName(chain: Chain): string {
  // TODO: we might want to synchronise this with the way viemConfig.chains() sources
  // env level RPC values. i.e. replacing the "HARHDAT_" prefix with something more generic
  // Latest suggestion is "API3_CHAINS_" instead.
  // See thread: https://github.com/api3dao/chains/pull/125/files#r1384859991
  return `HARDHAT_HTTP_RPC_URL_${toUpperSnakeCase(chain.alias)}`;
}

export function networkHttpRpcUrl(chain: Chain): string {
  const defaultProvider = chain.providers.find((provider) => provider.alias === 'default');
  return process.env[networkHttpRpcUrlName(chain)] ?? defaultProvider!.rpcUrl!;
}

export function credentials(): { accounts: { mnemonic: string } } | { keycardAccount: string } {
  return process.env.KEYCARD_ACCOUNT
    ? { keycardAccount: process.env.KEYCARD_ACCOUNT }
    : { accounts: { mnemonic: process.env.MNEMONIC ?? '' } };
}

export function etherscanChains(): Chain[] {
  return CHAINS.filter((chain) => chain.verificationApi?.type === 'etherscan');
}

export function blockscoutChains(): Chain[] {
  return CHAINS.filter(
    (chain) => chain.verificationApi?.type === 'blockscout' || chain.verificationApi?.type === 'other'
  );
}

export const ETHERSCAN_API_URL = 'https://api.etherscan.io/v2/api';

// Hardhat 2's hardhat-verify has nowhere in its config to put a chain id, so the V2 endpoint takes
// it in the URL. Hardhat 3's sends `chainid` as a query param of its own and so needs the bare
// endpoint: undici refuses to add query params to a URL that already carries a query string.
export function etherscanApiUrl(chain: Chain): string {
  return `${ETHERSCAN_API_URL}?chainid=${chain.id}`;
}

export function blockscoutApiUrl(chain: Chain): string {
  return chain.verificationApi?.type === 'blockscout' || chain.verificationApi?.type === 'other'
    ? chain.verificationApi.url
    : '';
}

export const SOURCIFY_API_URL = 'https://sourcify.dev/server';
