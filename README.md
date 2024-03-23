# @api3/contracts

> Contracts through which API3 services are delivered

This package provides the tools to integrate data feeds that can be found at the [API3 Market](https://market.api3.org). The typical workflow is as follows:

1. Purchase data feed subscriptions at the API3 Market
1. Deploy the respective DapiProxyWithOev contracts at the API3 Market
1. Use the proxy contract interfaces provided by this package in the reader contract, as demonstrated in https://github.com/api3dao/data-feed-reader-example
1. Use the proxy address computation utility functions provided by this package to validate the proxy addresses being used

A more complete list of what this package includes is as follows:

- All contracts that facilitate API3 data feed services
- `@typechain/ethers-v6` typings of these contracts
- Addresses of the API3 deployments of these contracts
- Proxy address computation utility functions

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

It should print

```
Checking if contracts in @openzeppelin/contracts@4.8.2 are identical to the ones in the package at https://registry.npmjs.org/@openzeppelin/contracts/-/contracts-4.8.2.tgz
Strings.sol is identical!
Create2.sol is identical!
Context.sol is identical!
Address.sol is identical!
Ownable.sol is identical!
IAccessControl.sol is identical!
AccessControl.sol is identical!
Math.sol is identical!
IERC165.sol is identical!
ERC165.sol is identical!
ECDSA.sol is identical!
Checking if contracts in @openzeppelin/contracts@4.9.5 are identical to the ones in the package at https://registry.npmjs.org/@openzeppelin/contracts/-/contracts-4.9.5.tgz
Strings.sol is identical!
Context.sol is identical!
Ownable.sol is identical!
SignedMath.sol is identical!
SafeCast.sol is identical!
Math.sol is identical!
EnumerableSet.sol is identical!
MerkleProof.sol is identical!
ECDSA.sol is identical!
```

Validate the deployment config

```sh
pnpm validate-deployment-config
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
