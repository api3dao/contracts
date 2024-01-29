# api3-contracts

> Contracts through which API3 services are delivered

## Instructions

Install the dependencies and build

```sh
pnpm install
```

Test the contracts, get coverage and gas reports

```sh
yarn test
# Outputs to `./coverage`
yarn test:coverage
# Outputs to `gas_report`
yarn test:gas
```

Verify that the vendor contracts are identical to the ones from their respective packages.
You will need to run this with Node.js 20, and have `wget` and `tar` on your system.

```sh
pnpm verify-vendor-contracts
```

It should print

```
Checking if contracts in @openzeppelin/contracts@4.9.5 are identical to the ones in the package at https://registry.npmjs.org/@openzeppelin/contracts/-/contracts-4.9.5.tgz
Ownable.sol is identical!
Context.sol is identical!
Strings.sol is identical!
ECDSA.sol is identical!
MerkleProof.sol is identical!
Math.sol is identical!
SafeCast.sol is identical!
SignedMath.sol is identical!
EnumerableSet.sol is identical!
```
