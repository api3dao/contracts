# GnosisSafeWithoutProxy

The first step of a new chain integration for [API3 Market](../../glossary.md#api3-market) is deploying GnosisSafeWithoutProxy as the [manager multisig](../../glossary.md#manager-multisig).

## Why customize the Safe contract?

At the time that the manager multisig needs to be deployed, the official Safe contracts are often not deployed yet.
Although [instructions](https://github.com/safe-global/safe-singleton-factory/tree/9b54922c6ee118ac609da0c746afa2e77837a3eb?tab=readme-ov-file#how-to-get-the-singleton-deployed-to-your-network) for how to initiate this process is provided, they do not apply to our use-case because:

1. The chain is often not launched at this point and there is an embargo on even the most basic information like the chain ID or the RPC URLs
2. We cannot afford to wait for the Safe team to provide signatures

GnosisSafeWithoutProxy is a fork of [GnosisSafe v1.3.0](https://github.com/safe-global/safe-smart-account/blob/v1.3.0/contracts/GnosisSafe.sol) that repurposes the singleton as a standalone multisig contract.
One can simply deploy GnosisSafeWithoutProxy undeterministically with the initial owners and threshold, which will always work for any chain, regardless of any idiosyncrasies.

> **Warning**
>
> Unlike regular Safe deployments, GnosisSafeWithoutProxy is not upgradeable.
> Since GnosisSafeWithoutProxy is mainly used as the owner of an [OwnableCallForwarder](./ownablecallforwarder.md), it can be effectively upgraded by transferring the ownership of the OwnableCallForwarder to the new implementation.

## Client

As can be expected, the Safe client does not support GnosisSafeWithoutProxy.
Furthermore, we cannot rely on clients operated by third parties for our use-case, and the official client is rather [cumbersome](https://github.com/safe-global/safe-infrastructure/tree/79067261378769a89f4490cabfbfa9d5d0fb5be5?tab=readme-ov-file#safe-infrastructure) to operate, let alone maintain a fork of it.
Therefore, GnosisSafeWithoutProxy is intended to be used with a custom client implementation that signers run locally.
