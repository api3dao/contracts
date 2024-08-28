# RoleDeriver

Roles are identified by a `bytes32` type:

- For Root Role: Hash of the respective manager address
- For all other roles: Hash of the parent role and the role description hash

This design implies:

- Each unique manager has its own role tree, and roles across different trees will not collide (barring an accidental 256-bit hash collision)
- Two different roles that are associated with sibling nodes must have different role descriptions

RoleDeriver provides the following role derivation functions:

- Derives Root Role
- Derives a non-Root Role given the role description
- Derives a non-Root Role given the role description hash (a cheaper alternative intended for AccessControlRegistryAdminned use-cases)
