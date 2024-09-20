# Api3ReaderProxyV1Factory

Api3ReaderProxyV1Factory is the contract that should be used to deploy [Api3ReaderProxyV1](./api3readerproxyv1.md) contracts.
It deploys both a UUPS-upgradeable proxy and an implementation, and returns the address of the proxy.

Api3ReaderProxyV1Factory deploys Api3ReaderProxyV1 deterministically and Api3ReaderProxyV1 is Ownable.
This may cause the following scenario

- Alice is the owner of Api3ReaderProxyV1Factory
- Api3ReaderProxyV1Factory deploys a new Api3ReaderProxyV1 (whose owner is Alice)
- Alice transfers the ownership of the Api3ReaderProxyV1 to Bob
- Alice needs to deploy another Api3ReaderProxyV1 with identical parameters and transfer its ownership to Charlie, yet cannot because of the contract addresses will collide

As a solution, an arbitrary `metadata` value is allowed to be provided while deploying an Api3ReaderProxyV1, which acts as the deterministic deployment hash.
