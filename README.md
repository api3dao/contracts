# @api3/contracts

<div align="center">

[![npm version](https://img.shields.io/npm/v/%40api3%2Fcontracts)](https://www.npmjs.com/package/@api3/contracts)
![downloads per week](https://img.shields.io/npm/dw/%40api3%2Fcontracts)
[![continuous-build](https://img.shields.io/github/actions/workflow/status/api3dao/contracts/continuous-build.yml?label=continuous-build)](https://github.com/api3dao/contracts/actions/workflows/continuous-build.yml)
[![validate-verify](https://img.shields.io/github/actions/workflow/status/api3dao/contracts/validate-verify.yml?label=validate-verify)](https://github.com/api3dao/contracts/actions/workflows/validate-verify.yml)
[![license](https://img.shields.io/npm/l/%40api3%2Fchains)](https://www.npmjs.com/package/@api3/contracts)

</div>

> Contracts through which API3 services are delivered

This package provides the tools to integrate data feeds that can be found at the [API3 Market](https://market.api3.org). The typical workflow is as follows:

1. Purchase data feed subscriptions and get the respective proxy addresses at the API3 Market
2. Use the proxy address computation utility function provided by this package (`computeCommunalApi3ReaderProxyV1Address()`) to validate the proxy addresses being used
3. Use the proxy contract interfaces provided by this package in the reader contract, as demonstrated in https://github.com/api3dao/data-feed-reader-example

A more complete list of what this package includes is as follows:

- All contracts that facilitate API3 data feed services, including OEV auctions
- `@typechain/ethers-v6` typings of these contracts
- Addresses of the API3 deployments of these contracts
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

Verify that the vendor contracts are identical to the ones from their respective packages.

```sh
pnpm verify-vendor-contracts
```

Check the local files containing metadata

```sh
pnpm check
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
