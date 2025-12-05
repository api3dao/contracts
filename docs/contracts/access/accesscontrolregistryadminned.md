# AccessControlRegistryAdminned

AccessControlRegistryAdminned is designed to be inherited by contracts that require multiple, independent role trees that live in [AccessControlRegistry](./accesscontrolregistry.md).
An example use-case is a protocol contract that needs privileged accounts to be specified, where doing so is left to the respective user for the sake of trustlessness.

Since AccessControlRegistryAdminned is not used by the contracts in this repo, we will not go into further detail.
The interested reader can refer to [RequesterAuthorizerWithErc721](https://github.com/api3dao/airnode-protocol-v1/blob/main/contracts/authorizers/RequesterAuthorizerWithErc721.sol) for an example of its usage.
