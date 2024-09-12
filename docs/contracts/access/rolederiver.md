# RoleDeriver

Roles are identified by a `bytes32` type:

- For the [root role](../../glossary.md#root-role): Hash of the respective [manager](../../glossary.md#manager) address
- For all other roles: Hash of the parent role and the role description hash

This design implies:

- Each unique manager has its own role tree, and roles across different trees will not collide
- Two different roles that are associated with sibling nodes must have different role descriptions

RoleDeriver provides the following role derivation functions:

- Derives a root role
- Derives a non-root role given the role description
- Derives a non-root role given the role description hash (a cheaper alternative intended for [AccessControlRegistryAdminned](./accesscontrolregistryadminned.md) use-cases)
