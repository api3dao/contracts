import { JsonRpcProvider, Network } from 'ethers';

import { CHAINS, hardhatConfig } from '../../src/index.js';

export function createProvider(network: string): JsonRpcProvider {
  const chain = CHAINS.find((chain) => chain.alias === network)!;
  // Otherwise ethers batches eth_chainId with every request, and some RPCs (e.g., that of Mantle Sepolia) answer a tx
  // lookup batched that way with null
  const staticNetwork = new Network(chain.alias, chain.id);
  return new JsonRpcProvider(hardhatConfig.networkHttpRpcUrl(chain), staticNetwork, { staticNetwork });
}
