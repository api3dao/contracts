import * as deployExtension from '@rocketh/deploy';
import type { EnhancedEnvironment, UnknownDeployments, UserConfig } from 'rocketh/types';

// Index 0 resolves against eth_accounts of the network provider. With a mnemonic that is the first
// derived account, and with a hardware wallet provider it is the single address that provider
// offers, which is the account the deployments were made from.
export const config = {
  accounts: {
    deployer: { default: 0 },
  },
  data: {},
} as const satisfies UserConfig;

// Only the deploy extension: nothing calls read or execute, and the one proxy in this repository is
// deployed by an on-chain factory rather than by hardhat-deploy.
const extensions = { ...deployExtension };
export { extensions };

type Extensions = typeof extensions;
type Accounts = typeof config.accounts;
type Data = typeof config.data;
type Environment = EnhancedEnvironment<Accounts, Data, UnknownDeployments, Extensions>;

export type { Accounts, Data, Environment, Extensions };
