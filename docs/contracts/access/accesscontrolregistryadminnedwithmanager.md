# AccessControlRegistryAdminnedWithManager

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
Admin Role is an abstraction layer that can grant or revoke the contract-specific roles.
In most cases, the admin role will only be granted to the manager, yet being able to grant it to other accounts provides flexibility.

> **Warning**
>
> The access control contracts in this repo uses the term "admin" in two different contexts:
>
> 1. `adminRole` in AccessControlRegistry, in the same way that OpenZeppelin uses it in AccessControl (i.e., if Role A is the admin role of Role B, accounts that have Role A can grant and revoke Role B)
> 1. `adminRole` in AccessControlRegistryAdminned and AccessControlRegistryAdminnedWithManager, referring to the abstraction layer between the root role and the contract-specific roles (as seen in the example tree above).
>    This is also what AccessControlRegistry**Adminned** and AccessControlRegistry**Adminned**WithManager refer to.

## Choosing a manager

Contracts inheriting AccessControlRegistryAdminnedWithManager must specify an immutable manager at deployment.
If the management is desired to be transferrable, one can deploy an OwnableCallFowarder contract, transfer its ownership to the initial manager, and use the address of the OwnableCallFowarder contract as the manager.

## Choosing an admin role description

The manager address and the role description comprises the admin role of AccessControlRegistryAdminnedWithManager.
One thing to notice here is that two contracts inheriting AccessControlRegistryAdminnedWithManager will share the same role tree if they have the same manager address and role description.
This may be convenient in some use-cases, while it happening accidentally may cause a critical vulnerability.

Let us first walk through a case where this is convenient.
Say our contract inherits AccessControlRegistryAdminnedWithManager and is deployed undeterministically.
We later on decide that we want to migrate to a version that has been deployed deterministically.
Then, we can simply make a deterministic deployment with the same manager address and admin role description, and the role tree belonging to the old deployment will immediately apply to the new deployment.

This feature may also cause trouble when not handled correctly.
Say we made a test deployment, initialized and granted roles, and just played around with the contract features in general.
Satisfied with the result, we moved on to other tasks.
Months later, we decide that it is time for the production deployment.
Forgetting about the test deployment, a "fresh" production deployment is made with the same manager address and admin role description.
Then, all the role configurations from the test deployment will apply to the production deployment, which is potentially catastrophic.

In short, the deployer of contracts that inherit AccessControlRegistryAdminnedWithManager should be very deliberate regarding if they want the new contract to depend on an existing role tree or a fresh one.
For the former, the exact same respective admin role description must be used, and for the latter, an admin role description unique to the deployment must be used.
