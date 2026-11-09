import type { NetworkHooks } from 'hardhat/types/hooks';

// keycardProvider signs only for networks that name a keycardAccount, and the `fork` network that
// HARDHAT_FORK adds does not, so a rehearsal would deploy from EDR's test accounts. On the fork, list
// the card's account alone as the card does, and impersonate it, so the rehearsal runs from the
// deployer's own address, nonce and balance without the card.
// eslint-disable-next-line import/no-default-export
export default async (): Promise<Partial<NetworkHooks>> => ({
  async onRequest(context, networkConnection, jsonRpcRequest, next) {
    const keycardAccount = process.env.KEYCARD_ACCOUNT;
    if (networkConnection.networkName !== 'fork' || !keycardAccount || jsonRpcRequest.method !== 'eth_accounts') {
      return next(context, networkConnection, jsonRpcRequest);
    }
    await next(context, networkConnection, {
      jsonrpc: '2.0',
      id: jsonRpcRequest.id,
      method: 'hardhat_impersonateAccount',
      params: [keycardAccount],
    });
    return { jsonrpc: '2.0', id: jsonRpcRequest.id, result: [keycardAccount] };
  },
});
