# @api3/contracts

> Contracts through which API3 services are delivered

## Instructions

Install the dependencies and build

```sh
pnpm install
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

Verify the deployments

```sh
# on all chains
pnpm verify-deployments
# or a single chain
NETWORK=ethereum pnpm verify-deployments
```
