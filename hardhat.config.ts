import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import 'dotenv/config';
import { defineConfig } from 'hardhat/config';
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

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  plugins: [
    hardhatToolboxMochaEthers,
    hardhatDeploy,
    // Signs with a Keycard when KEYCARD_ACCOUNT is set, which is the field
    // hardhatConfig.networks() puts on each network in place of a mnemonic.
    keycardProvider,
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
  ],
  // `hardhat deploy` and verification use the production profile, and Hardhat derives an undeclared
  // one from the default by dropping its settings, so leaving it implicit changes the bytecode.
  solidity: {
    profiles: {
      default: { compilers },
      production: { compilers },
    },
  },
  typechain: { outDir: 'typechain-types' },
  // rocketh/deploy.ts reads these, and the deploy scripts pass them to env.deploy.
  generateTypedArtifacts: { destinations: [{ folder: './generated', mode: 'typescript' }] },
  networks: hardhatConfig.v3.networks(),
  chainDescriptors: hardhatConfig.v3.chainDescriptors(),
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
