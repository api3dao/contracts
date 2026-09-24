import type { NetworkHooks } from 'hardhat/types/hooks';
import type { ChainType, NetworkConnection } from 'hardhat/types/network';

// Every network connection that is open, so a task can close the ones it caused to be opened.
export const openConnections = new Set<NetworkConnection<ChainType | string>>();

// eslint-disable-next-line import/no-default-export
export default async (): Promise<Partial<NetworkHooks>> => ({
  async newConnection(context, next) {
    const connection = await next(context);
    openConnections.add(connection);
    return connection;
  },

  async closeConnection(context, connection, next) {
    openConnections.delete(connection);
    await next(context, connection);
  },
});
