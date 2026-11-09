import path from 'node:path';

import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import 'dotenv/config';
import { defineConfig, overrideTask } from 'hardhat/config';
import type { NetworkUserConfig } from 'hardhat/types/config';
import hardhatDeploy from 'hardhat-deploy';
import keycardProvider from 'keycard-hardhat-provider';

// ./src/index re-exports ../typechain-types, which does not exist before the first build.
import * as hardhatConfig from './src/hardhat-config.js';

// The deployment records hold metadata and storageLayout, and verification needs metadata.
const outputSelection = {
  '*': {
    '*': ['metadata', 'storageLayout', 'devdoc', 'userdoc', 'evm.gasEstimates'],
  },
};

// Left unset, solc targets cancun for 0.8.27, which changes the bytecode and every deterministic
// address built with it.
const settingsFor = (runs: number, evmVersion: string) => ({
  optimizer: { enabled: true, runs },
  evmVersion,
  metadata: { useLiteralContent: true },
  outputSelection,
});

const compilers = [
  { version: '0.8.12', settings: settingsFor(200, 'london') },
  { version: '0.8.17', settings: settingsFor(1000, 'london') },
  { version: '0.8.27', settings: settingsFor(1000, 'paris') },
];

// HARDHAT_FORK=<network> adds a `fork` network that simulates it, to rehearse a deploy on. The helper
// is imported only then, as it loads rocketh, which slows every Hardhat command by about 0.3 s.
let networks: Record<string, NetworkUserConfig> = hardhatConfig.v3.networks();
if (process.env.HARDHAT_FORK) {
  const { addForkConfiguration } = await import('hardhat-deploy/helpers');
  networks = addForkConfiguration(networks);
  // The simulated network's mnemonic is copied over, and EDR rejects the empty one it holds without
  // MNEMONIC. The fork keeps EDR's own accounts instead.
  const { fork } = networks;
  if (fork !== undefined && !process.env.MNEMONIC) {
    const { accounts: _emptyMnemonic, ...forkWithoutAccounts } = fork;
    networks.fork = forkWithoutAccounts;
  }
}
const forkedChainId = networks[process.env.HARDHAT_FORK ?? '']?.chainId;

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  plugins: [
    // Before the toolbox, so TypeChain sees the sorted list.
    {
      id: 'api3-sorted-artifact-paths',
      hookHandlers: { solidity: async () => import('./plugins/sorted-artifact-paths.js') },
    },
    hardhatToolboxMochaEthers,
    hardhatDeploy,
    // Signs with a Keycard when KEYCARD_ACCOUNT is set, which is the field
    // hardhatConfig.networks() puts on each network in place of a mnemonic.
    keycardProvider,
    {
      id: 'api3-rocketh-rpc-workarounds',
      hookHandlers: { network: async () => import('./plugins/rocketh-rpc-workarounds.js') },
    },
    {
      id: 'api3-fork-keycard-account',
      hookHandlers: { network: async () => import('./plugins/fork-keycard-account.js') },
    },
    {
      id: 'api3-solc-source-names',
      hookHandlers: { solidity: async () => import('./plugins/solc-source-names.js') },
    },
    // After hardhat-deploy, so these see the artifacts it generates.
    {
      id: 'api3-generated-artifact-names',
      hookHandlers: { solidity: async () => import('./plugins/generated-artifact-names.js') },
    },
    {
      id: 'api3-deployed-metadata-hashes',
      hookHandlers: { solidity: async () => import('./plugins/deployed-metadata-hashes.js') },
    },
    // After hardhat-deploy, which defines the deploy task this overrides. Closing the connection is
    // what makes keycardProvider disconnect the card.
    {
      id: 'api3-close-deploy-connections',
      hookHandlers: { network: async () => import('./plugins/open-connections.js') },
      tasks: [
        overrideTask('deploy')
          .setAction(async () => import('./plugins/close-deploy-connections.js'))
          .build(),
      ],
    },
  ],
  // `hardhat deploy` and verification use the production profile, and Hardhat derives an undeclared
  // one from the default by dropping its settings, so leaving it implicit changes the bytecode.
  solidity: {
    profiles: {
      default: { compilers },
      production: { compilers },
    },
  },
  // hardhat-deploy, and hardhat-typechain when cleaning, resolve a relative folder against the
  // working directory, so a command run from a subdirectory would write or remove it there.
  typechain: { outDir: path.join(import.meta.dirname, 'typechain-types') },
  // rocketh/deploy.ts reads these, and the deploy scripts pass them to env.deploy.
  generateTypedArtifacts: {
    destinations: [{ folder: path.join(import.meta.dirname, 'generated'), mode: 'typescript' }],
  },
  networks,
  chainDescriptors: {
    ...hardhatConfig.v3.chainDescriptors(),
    // EDR runs a call on a forked block only along that chain's hardfork history, which it has for few
    // chains. The `fork` network simulates osaka on l1, and a rehearsal only reads the latest state.
    ...(forkedChainId === undefined
      ? {}
      : {
          [forkedChainId]: {
            name: process.env.HARDHAT_FORK!,
            chainType: 'l1',
            hardforkHistory: { osaka: { blockNumber: 0 } },
          },
        }),
  },
  verify: hardhatConfig.v3.verify(),
  paths: {
    tests: { mocha: process.env.EXTENDED_TEST ? './test-extended' : './test' },
  },
  test: {
    mocha: {
      timeout: process.env.EXTENDED_TEST ? 60 * 60_000 : 60_000,
      parallel: process.env.NO_PARALLEL !== 'true',
    },
  },
  coverage: {
    // These match user source names, not directory prefixes.
    skipFiles: ['contracts/mock/**', 'contracts/test/**', 'contracts/vendor/**'],
  },
});
