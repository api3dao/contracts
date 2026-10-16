import type { NetworkHooks } from 'hardhat/types/hooks';

// rocketh reads eth_feeHistory before it runs any deploy script, and prices with eth_gasPrice
// instead only if the node says the method does not exist. Kava returns null base fees and
// Injective sometimes a -32000 error, which would otherwise abort the deploy, so both are reported
// as that.
const UNSUPPORTED = 'The method "eth_feeHistory" does not exist/is not available';

// rocketh also aborts if block 0's hash differs from the one in deployments/<network>/.chain, and
// the nodes of these networks disagree about it. Without a block 0, it checks the chain id only. It
// skips the check on a fork.
const NETWORKS_WITH_UNSTABLE_GENESIS = new Set(['ronin', 'zircuit']);

// eslint-disable-next-line import/no-default-export
export default async (): Promise<Partial<NetworkHooks>> => ({
  async onRequest(context, networkConnection, jsonRpcRequest, next) {
    if (
      jsonRpcRequest.method === 'eth_getBlockByNumber' &&
      Array.isArray(jsonRpcRequest.params) &&
      jsonRpcRequest.params[0] === '0x0' &&
      NETWORKS_WITH_UNSTABLE_GENESIS.has(networkConnection.networkName)
    ) {
      return { jsonrpc: '2.0', id: jsonRpcRequest.id, result: null };
    }

    const response = await next(context, networkConnection, jsonRpcRequest);
    if (jsonRpcRequest.method !== 'eth_feeHistory') return response;

    const feeHistory = 'result' in response ? (response.result as { baseFeePerGas?: unknown; reward?: unknown }) : {};
    const usable =
      Array.isArray(feeHistory.reward) &&
      Array.isArray(feeHistory.baseFeePerGas) &&
      feeHistory.baseFeePerGas.every((fee) => typeof fee === 'string');
    return usable
      ? response
      : { jsonrpc: '2.0', id: jsonRpcRequest.id, error: { code: -32_601, message: UNSUPPORTED } };
  },
});
