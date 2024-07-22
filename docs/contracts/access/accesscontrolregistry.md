# AccessControlRegistry

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

Above is an example role tree.
Each node represents a role that can grant the roles represented by its child nodes.
For example, Root Role can grant Admin Role A and Admin Role B (but not Editor, Viewer, Minter or Burner), Admin Role A can grant Editor and Viewer, etc.
The top-most role, Root Role, is immutably associated with a unique _manager_ account (i.e., each manager account has its own unique role tree).
Unlike the other roles, Root Role cannot be renounced.

## Using AccessControlRegistry

External contracts are intended to refer to role trees that are already defined by their manager on AccessControlRegistry.
It is recommended for such external contracts to inherit [AccessControlRegistryAdminned](./accesscontrolregistryadminned.md) or [AccessControlRegistryAdminnedWithManager](./accesscontrolregistryadminnedwithmanager.md) depending on the use-case.
Briefly, AccessControlRegistryAdminnedWithManager expects a role tree per contract, while AccessControlRegistryAdminned expects a role tree per user of a contract.

Note that these contracts only implement the admin-level roles, and the inheriting contract should still implement the contract-specific roles (such as Editor and Viewer in the example above).
The user is highly recommended to refer to contracts that inherit these contracts (such as DapiServer) as examples.

## Initializing role trees

Role trees are often composed of multiple roles and role members.
AccessControlRegistry inherits SelfMulticall for a tree to be configured in a single transaction.
An example multicall transaction sent by the manager could look like:
1. Initialize Admin Role A and grant it to the manager (which will also initialize Root Role)
1. Initialize Editor and grant it to the manager
1. Initialize Viewer and grant it to the manager
1. (Optional) Grant Admin Role A to the respective account
1. Grant Editor to the respective account
1. Grant Viewer to the respective account
1. (Optional) Renounce Editor
1. (Optional) Renounce Viewer
1. (Optional) Renounce Admin Role A

Admin Role A is often an abstraction layer that is not needed to be granted to an account other than the manager, which is why the respective call is optional.
The manager renouncing any of the roles is redundant in the case it is an EOA/multisig/DAO that can make arbitrary calls, as the manager can grant these roles back to itself at will.

## Discovering roles and role members

In the AccessControlRegistryAdminned use-case, creating new role trees is a frequent operation, which is why it is important for this to be done cheaply.
To this end, AccessControlRegistry roles or role members are not enumerated.
This means that clients will have to utilize logs for discovering role trees and their current state.

## ERC-2771 support

A previous version of this contract supported ERC-2771 for users to be able to configured their role trees through meta-transactions.
This was later removed due to creating a vulnerability.
Refer to [this article](https://medium.com/api3/accesscontrolregistry-contract-vulnerability-related-to-openzeppelin-dependencies-2baafd47db7a) for more details.
