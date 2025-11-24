# Access control contracts

This directory contains various access control contracts for managing Api3 services.
The key design principle is to centralize access control configurations, improving visibility and reducing mismanagement risks.

## Role management

- [AccessControlRegistry](./accesscontrolregistry.md): Central contract storing all access control configurations as roles.
- Contracts can be [adminned](../../glossary.md#admin-role) by AccessControlRegistry by inheriting:
  - [AccessControlRegistryAdminned](./accesscontrolregistryadminned.md)
  - [AccessControlRegistryAdminnedWithManager](./accesscontrolregistryadminnedwithmanager.md)
- [RoleDeriver](./rolederiver.md): For contracts not adminned by AccessControlRegistry but needing role awareness.

## Manager contracts

AccessControlRegistry organizes roles in tree structures, with each tree controlled by a unique [manager](../../glossary.md#manager) account.
The manager address is immutable, originally designed for [Airnode addresses](../../glossary.md#airnode-address) to manage their own role trees.

Some use-cases require the management of role trees to be transferrable.
For example, Api3 DAO members operate a [multisig](../../glossary.md#manager-multisig) that is the manager of the role tree that is related to Api3 services.
At some point, this multisig may want to transfer the management of the role tree to the Api3 DAO.
In such use-cases, role trees are created with an [OwnableCallForwarder](./ownablecallforwarder.md) contract as the manager.
OwnableCallForwarder is a minimal contract that forwards calls from its owner, with transferrable ownership.

Api3 often integrates chains within the first few days that they go live, and the Api3 manager multisig being deployed is the first step of this process.
A common issue here is the official Safe contract deployment process holding up the integration.
To avoid being blocked by this, Api3 uses a manager multisig that is a customized GnosisSafe (v1.3.0) called [GnosisSafeWithoutProxy](./gnosissafewithoutproxy.md).

## Chain-agnostic multisig

Reviewing and cryptographically signing off on [dAPI](../../glossary.md#dapi) parameters is an important part of Api3 operations.
Considering that Api3 aims to serve hundreds of chains, doing this on a per-chain basis quickly becomes infeasible.
[HashRegistry](./hashregistry.md) implements a custom multisig scheme where signatures can be replayed across chains to address this issue.
