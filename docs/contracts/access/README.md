# Access control contracts

This directory includes various access control contracts that are used in managing API3 services.
The key philosophy behind these contracts is that the primary risk in access control is mismanagement.
Centralizing all access control configurations in a single contract would improve visibility, and thus mitigate this risk.

## Role management

AccessControlRegistry is the contract that houses all access control configurations in the form of roles.
For a contract to refer to AccessControlRegistry for access control configurations (i.e., for it to be "adminned" by AccessControlRegistry), it is intended to inherit AccessControlRegistryAdminned or AccessControlRegistryAdminnedWithManager.
Furthermore, a RoleDeriver contract is provided to be inherited by contracts that are not adminned by AccessControlRegistry, but still need to be aware of roles.

## Manager contracts

AccessControlRegistry keeps roles in the form of trees, where the root is controlled by a single account called the "manager".
The address of this account is immutable by design, mainly because it was intended for [Airnode addresses](../../specs/airnode-protocol.md#airnode-address) to be managers of their own role trees.
However, some use cases require the management of role trees to be transferrable.
For example, API3 DAO members operate a multisig that is the manager of the role tree that is related to API3 services.
At some point, this multisig may want to transfer the management of the role tree to the API3 DAO.
In such use cases, role trees are created with an OwnableCallForwarder contract as the manager.
OwnableCallForwarder is a minimal contract that forwards calls from its owner, with transferrable ownership.

API3 often integrates chains within the first few days that they go live, and the API3 manager multisig being deployed is one of the first steps of this process.
A common issue here is temporary compatibility issues in the official Safe contract deployment process.
To avoid being blocked by this, API3 uses a manager multisig that is a customized GnosisSafe (v1.3.0) called GnosisSafeWithoutProxy.

## Cross-chain multisig

Reviewing and cryptographically signing off on dAPI parameters is an important part of API3 operations.
Considering that API3 aims to serve hundreds of chains, doing this on a per-chain basis quickly becomes infeasible.
HashRegistry implements a custom multisig scheme where signatures can be replayed across chains to address this issue.
