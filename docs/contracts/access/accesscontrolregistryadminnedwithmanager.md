# AccessControlRegistryAdminnedWithManager

AccessControlRegistryAdminnedWithManager is designed to be inherited by contracts that require a single role tree that live in [AccessControlRegistry](./accesscontrolregistry.md).
Since it implements a single role tree, it has a single [manager](../../glossary.md#manager).

```
    Root Role
        |
   Admin Role
        |
   +----+----+
   |         |
Editor    Viewer
```

AccessControlRegistryAdminnedWithManager expects the use of a role tree such as the above.
Here, Editor and Viewer are contract-specific roles that the inheriting contract is expected to implement.
[Admin role](../../glossary.md#admin-role) is an abstraction layer that can grant or revoke the contract-specific roles.
In most cases, the admin role will only be granted to the manager, yet being able to grant it to other accounts provides flexibility.

## Choosing a manager

Contracts inheriting AccessControlRegistryAdminnedWithManager must specify an immutable manager at deployment.
If the management is desired to be transferrable, one can deploy an [OwnableCallFowarder](./ownablecallforwarder.md) contract, transfer its ownership to the initial manager, and use the address of the OwnableCallFowarder contract as the manager.

## Choosing an admin role description

The manager address and the role description form the admin role of AccessControlRegistryAdminnedWithManager.
An important thing to notice here is that two contracts inheriting AccessControlRegistryAdminnedWithManager will share the same role tree if they have the same manager address and role description.
This may be convenient in some use-cases, while it happening accidentally may cause a critical vulnerability.

Let us first walk through a case where this is convenient.
Say our contract inherits AccessControlRegistryAdminnedWithManager and is deployed undeterministically.
We later on decide that we want to migrate to a version that has been deployed deterministically.
Then, we can simply make a deterministic deployment with the same manager address and admin role description, and the role tree belonging to the old deployment will automatically apply to the new deployment.

This feature may also cause issues when not handled correctly.
Say we made a test deployment, initialized and granted roles, and played around with the contract features.
Satisfied with the result, we moved on to other tasks.
Months later, we decide that it is time for the production deployment.
Forgetting about the test deployment, a "fresh" production deployment is made with the same manager address and admin role description.
Then, all the role configurations from the test deployment will apply to the production deployment, which is potentially catastrophic.

In short, the deployer of contracts that inherit AccessControlRegistryAdminnedWithManager should be very deliberate regarding if they want the new contract to depend on an existing role tree or a fresh one.
For the former, the exact same respective admin role description must be used, and for the latter, an admin role description unique to the deployment must be used.
