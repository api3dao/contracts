# @api3/contracts

<div align="center">

[![npm version](https://img.shields.io/npm/v/%40api3%2Fcontracts)](https://www.npmjs.com/package/@api3/contracts)
![downloads per week](https://img.shields.io/npm/dw/%40api3%2Fcontracts)
[![continuous-build](https://img.shields.io/github/actions/workflow/status/api3dao/contracts/continuous-build.yml?label=continuous-build)](https://github.com/api3dao/contracts/actions/workflows/continuous-build.yml)
[![validate-verify](https://img.shields.io/github/actions/workflow/status/api3dao/contracts/validate-verify.yml?label=validate-verify)](https://github.com/api3dao/contracts/actions/workflows/validate-verify.yml)
[![license](https://img.shields.io/npm/l/%40api3%2Fchains)](https://www.npmjs.com/package/@api3/contracts)

</div>

> Contracts through which Api3 services are delivered

This package provides the tools to integrate data feeds that can be found at the [Api3 Market](https://market.api3.org). The typical workflow is as follows:

1. Purchase data feed subscriptions and get the respective proxy addresses at the Api3 Market
2. Use the proxy address computation utility function provided by this package (`computeCommunalApi3ReaderProxyV1Address()`) to validate the proxy addresses being used
3. Use the proxy contract interfaces provided by this package in the reader contract, as demonstrated in https://github.com/api3dao/data-feed-reader-example

A more complete list of what this package includes is as follows:

- All contracts that facilitate Api3 data feed services, including OEV auctions
- `@typechain/ethers-v6` typings of these contracts
- Addresses of the Api3 deployments of these contracts
- Proxy address computation utility functions

## Security

We have conducted 10+ audits of our contracts and their off-chain components.
Below are the reports of the ones that are directly related to the contracts in this repo (or in some cases, earlier versions of them).

- [2024-10-24 Quantstamp](./audit-reports/2024-10-24%20Quantstamp.pdf) (refer to [here](https://github.com/api3dao/contracts-qs/tree/final-report) for the commit hash)
- [2024-02-20 Quantstamp](./audit-reports/2024-02-20%20Quantstamp.pdf)
- [2023-12-20 Quantstamp](./audit-reports/2023-12-20%20Quantstamp.pdf)
- [2023-03-02 Sigma Prime](./audit-reports/2023-03-02%20Sigma%20Prime.pdf)
- [2022-03-30 Trail of Bits](./audit-reports/2022-03-30%20Trail%20of%20Bits.pdf)
- [2021-12-16 Sigma Prime](./audit-reports/2021-12-16%20Sigma%20Prime.pdf)

For bug reports, contact `security@api3.org`

## Development

The most common type of change would be adding or updating a chain. This can be done by creating or editing the relevant JSON file in the `data/chains/` directory.

If any changes are made to chains, you will need to "regenerate" the chains. This will compile all of the JSON files into a single TypeScript file for projects to import. Please check the [Developer instructions](#developer-instructions) section for more information on how to do this.

The list of TypeScript chains is also validated against all of the list of JSON files to ensure that everything is in sync.

NOTE: You will not be able to push changes to chains without having regenerated the TypeScript chains.

## Developer instructions

Install the dependencies and build

```sh
pnpm i && pnpm build
```

Test the contracts, get coverage and gas reports

```sh
pnpm test
pnpm test:extended
# Outputs to `./coverage`
pnpm test:coverage
# Outputs to `gas_report`
pnpm test:gas
```

Generates the latest `CHAINS` array and outputs the file to `src/generated/chains.ts`

```sh
pnpm generate:chains
```

Generates the latest `DAPP` array and outputs the file to `src/generated/dapp.ts`

```sh
pnpm generate:dapps
```

Generates deployment addresses for all chains and outputs the file to `src/generated/deployments.ts`

```sh
pnpm generate:deployment-addresses
```

Generates all of the above files in one go

```sh
pnpm generate
```

Check the local files containing metadata

```sh
pnpm check
```

Verify that the vendor contracts are identical to the ones from their respective packages.

```sh
pnpm verify-vendor-contracts
```

Verify the deployments and validate their current state

```sh
# on all chains
pnpm verify-deployments
# or a single chain
NETWORK=ethereum pnpm verify-deployments
# on all chains
pnpm validate-deployments
# or a single chain
NETWORK=ethereum pnpm validate-deployments
```

## 📖 API

The following variables/functions are exported from this package

### CHAINS

The single source of truth for the list of supported chains.
A static array of `Chain` objects.

```ts
import { CHAINS } from '@api3/contracts';
console.log(CHAINS);
/*
[
  {
    name: 'Arbitrum Sepolia testnet',
    alias: 'arbitrum-sepolia-testnet',
    id: '421614',
    ...
  },
  ...
]
*/
```

### hardhatConfig.networks()

Returns an object where the key is each chain's alias and the value is an object that can be used as the `networks` field of [`hardhat.config.js`](https://hardhat.org/hardhat-runner/docs/config).

The default `url` values can be overridden with chain specific environment variables. These environment variables take the form of `HARDHAT_HTTP_RPC_URL_${toUpperSnakeCase(chain.alias)}`. e.g. `HARDHAT_HTTP_RPC_URL_ARBITRUM_SEPOLIA_TESTNET`.

```ts
import { hardhatConfig } from '@api3/contracts';
console.log(hardhatConfig.networks());
/*
{
  "arbitrum-sepolia-testnet": {
      accounts: { mnemonic: '' },
      chainId: '421614',
      url: 'https://...',
  },
  ...
}
*/
```

### hardhatConfig.etherscan()

Returns an object where the key is each chain's alias and the value is an object that can be used as the `etherscan` field of [`hardhat.config.js`](https://hardhat.org/hardhat-runner/docs/config) (requires the [`hardhat-etherscan` plugin](https://hardhat.org/hardhat-runner/plugins/nomiclabs-hardhat-etherscan)).

NOTE: [hardhat-etherscan](https://www.npmjs.com/package/@nomiclabs/hardhat-etherscan) requires us to use a dummy API key with Blockscout block explorer APIs. We use "DUMMY_VALUE" but it could have been anything else.

```ts
import { hardhatConfig } from '@api3/contracts';
console.log(hardhatConfig.etherscan());
/*
{
  apiKey: {
    'arbitrumSepolia': { ... }
  },
  customChains: [
    ...
  ]
}
*/
```

### hardhatConfig.getEnvVariableNames()

Returns an array of expected environment variable names for chains that have an API key required for the explorer. The array also includes a single `MNEMONIC` variable that can be used to configure all networks.

NOTE: Each `ETHERSCAN_API_KEY_` and `HARDHAT_HTTP_RPC_URL_` environment variable has the chain alias as a suffix, where the alias has been converted to upper snake case.

```ts
import { hardhatConfig } from '@api3/contracts';
console.log(hardhatConfig.getEnvVariableNames());
/*
[
  'MNEMONIC',
  'ETHERSCAN_API_KEY_ARBITRUM_SEPOLIA_TESTNET',
  ...
  'HARDHAT_HTTP_RPC_URL_ARBITRUM_SEPOLIA_TESTNET',
  ...
]
*/
```

### viemConfig.chains()

Returns an array of chains in the format that [Viem](https://viem.sh/docs/chains/introduction) expects. Each Chain object can be used to [create a Viem public client](https://viem.sh/docs/clients/public#usage).

Additional `rpcUrls` values can (optionally) be added through the use of environment variables. These environment variables take the form of `API3_CHAINS_HTTP_RPC_URL_${toUpperSnakeCase(chain.alias)}`. If a matching environment variable is detected for a given chain, then it will be added to the `http` array of the `rpcUrls.environment` object. If no matching environment variable is detected, then the `http` array is left empty.

```ts
import { viemConfig } from '@api3/contracts';
console.log(viemConfig.chains());
/*
[
  {
    id: 421613,
    name: 'arbitrum-sepolia-testnet',
    network: 'arbitrum-sepolia-testnet',
    rpcUrls: { default: ..., public: ..., environment: ... }
    ...
  },
  ...
]
*/
```

### Types

Types are also exported and can be found in `src/types.ts`.
Types are generated from [zod](https://github.com/colinhacks/zod) schemas.
These schemas are also used to validate each chain.

## 🚢 Releasing

Releasing new versions is handled automatically with [changesets](https://github.com/changesets/changesets). Pull requests should include a changeset file before being merged.
These can be generated by running `pnpm changeset` and following the instructions. Once a new version is ready to be released, simply merge `main` into the `production`
branch. Changeset files will be consolidated into a single new version and that version released to npm.

<!-- markdown-link-check-disable -->

More information is contained in the [Api3 guidelines](https://github.com/api3dao/tasks/blob/main/API3%20Packages/changeset.md).

<!-- markdown-link-check-enable -->
