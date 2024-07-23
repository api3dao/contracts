# Access control contracts

This directory contains various access control contracts for managing API3 services.
The key design principle is to centralize access control configurations, improving visibility and reducing mismanagement risks.

## Role management

- AccessControlRegistry: Central contract storing all access control configurations as roles.
- Contracts can be _adminned_ by AccessControlRegistry by inheriting:
  - AccessControlRegistryAdminned
  - AccessControlRegistryAdminnedWithManager
- RoleDeriver: For contracts not adminned by AccessControlRegistry but needing role awareness.

## Manager contracts

AccessControlRegistry organizes roles in tree structures, with each tree controlled by a unique _manager_ account.
The manager address is immutable, originally designed for [Airnode addresses](../../specs/airnode-protocol.md#airnode-address) to manage their own role trees.

Some use-cases require the management of role trees to be transferrable.
For example, API3 DAO members operate a multisig that is the manager of the role tree that is related to API3 services.
At some point, this multisig may want to transfer the management of the role tree to the API3 DAO.
In such use cases, role trees are created with an OwnableCallForwarder contract as the manager.
OwnableCallForwarder is a minimal contract that forwards calls from its owner, with transferrable ownership.

API3 often integrates chains within the first few days that they go live, and the API3 manager multisig being deployed is one of the first steps of this process.
A common issue here is the official Safe contract deployment process holding up the integration.
To avoid being blocked by this, API3 uses a manager multisig that is a customized GnosisSafe (v1.3.0) called GnosisSafeWithoutProxy.

## Cross-chain multisig

Reviewing and cryptographically signing off on dAPI parameters is an important part of API3 operations.
Considering that API3 aims to serve hundreds of chains, doing this on a per-chain basis quickly becomes infeasible.
HashRegistry implements a custom multisig scheme where signatures can be replayed across chains to address this issue.
