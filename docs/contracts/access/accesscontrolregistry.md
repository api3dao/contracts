# AccessControlRegistry

AccessControlRegistry enables all accounts to [manage](../../glossary.md#manager) their respective access control role trees.

Each manager has a unique [root role](../../glossary.md#root-role), which is the root of their respective role tree.
Once initialized, a root role cannot be renounced.

In a role tree, each parent node is the [admin role](../../glossary.md#admin-role) of their child nodes.
A role can only be granted or revoked by its admin role.
Roles can be renounced, with the exception of the root role.

```
            Root Role
                |
        +-------+-------+
        |               |
   Admin Role A    Admin Role B
        |               |
   +----+----+     +----+----+
   |         |     |         |
Editor    Viewer  Minter  Burner
```

The diagram above illustrates an example role tree.
In this role tree,

- Root Role can grant Admin Role A and Admin Role B (but not Editor, Viewer, Minter or Burner)
- Admin Role A can grant Editor and Viewer
- Admin Role B can grant Minter and Burner

## Using AccessControlRegistry

External contracts should refer to role trees defined by their manager on AccessControlRegistry.
It is recommended to inherit either of the following:

- [AccessControlRegistryAdminned](./accesscontrolregistryadminned.md) if a role tree will be needed per each user of the external contract
- [AccessControlRegistryAdminnedWithManager](./accesscontrolregistryadminnedwithmanager.md) if a single role tree will be needed for the external contract

Note: These contracts implement [admin](../../glossary.md#admin-role)-level roles only.
Inheriting contracts should implement contract-specific roles (e.g., Editor and Viewer).

## Initializing role trees

AccessControlRegistry inherits [SelfMulticall](./utils/SelfMulticall) to allow a manager or admin to configure their portion of the tree in a single transaction.
An example multicall transaction by the manager may be:

1. Initialize Admin Role A and grant it to the manager (also initializes Root Role)
1. Initialize and grant Editor to the manager
1. Initialize and grant Viewer to the manager
1. (Optional) Grant Admin Role A to the respective account
1. Grant Editor to the respective account
1. Grant Viewer to the respective account
1. (Optional) Renounce Editor
1. (Optional) Renounce Viewer
1. (Optional) Renounce Admin Role A

Admin Role A is often an abstraction layer, hence the optional grant.
Manager renouncing roles is redundant if it can make arbitrary calls (i.e., if it is an EOA, multisig or a DAO), as it can reassume these roles at will.

## Discovering roles and role members

In the AccessControlRegistryAdminned use-case, creating new role trees is a frequent operation, which is why it is important for this to be done cheaply.
To this end, AccessControlRegistry roles or role members are not enumerated.
This means that clients will have to utilize logs for discovering role trees and the roles that accounts have.

## ERC-2771 support

A previous version of this contract supported [ERC-2771](https://eips.ethereum.org/EIPS/eip-2771) for managers to be able to configure their role trees through meta-transactions.
This was later removed due to a vulnerability.
Refer to [this article](https://medium.com/api3/accesscontrolregistry-contract-vulnerability-related-to-openzeppelin-dependencies-2baafd47db7a) for more details.
