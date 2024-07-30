# AccessControlRegistryAdminned

AccessControlRegistryAdminned is designed for use-cases where the inheriting contract needs to respect a different role tree for each user.
These will typically be centralized and trustless protocol contracts.
Since AccessControlRegistryAdminned is not used by the contarcts in this repo, we will not go into further detail.
The interested reader can refer to the [RequesterAuthorizerWithErc721](https://github.com/api3dao/airnode-protocol-v1/blob/main/contracts/authorizers/RequesterAuthorizerWithErc721.sol) implementation as an example of its usage.
