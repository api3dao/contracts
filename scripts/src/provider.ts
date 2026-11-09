import { go } from '@api3/commons';
import { JsonRpcProvider, Network } from 'ethers';

import { CHAINS, hardhatConfig } from '../../src/index.js';
import { goAsyncOptions } from '../constants.js';

export async function createProvider(network: string): Promise<JsonRpcProvider> {
  const chain = CHAINS.find((chain) => chain.alias === network)!;
  // Otherwise ethers batches eth_chainId with every request, and some RPCs (e.g., that of Mantle Sepolia) answer a tx
  // lookup batched that way with null
  const staticNetwork = new Network(chain.alias, chain.id);
  const provider = new JsonRpcProvider(hardhatConfig.networkHttpRpcUrl(chain), staticNetwork, { staticNetwork });

  // Make sure the RPC is working and serves the configured chain by making a call to get the chain ID
  const goChainId = await go(async () => provider.send('eth_chainId', []), goAsyncOptions);
  if (!goChainId.success) {
    throw new Error(`${network} provider could not be created, which is likely an RPC issue`);
  }
  const chainId = BigInt(goChainId.data);
  if (chainId !== BigInt(chain.id)) {
    throw new Error(`${network} RPC responds with chain ID ${chainId} instead of ${chain.id}`);
  }
  return provider;
}
