# OwnableCallForwarder

OwnableCallForwarder is an Ownable contract that forwards calls made by its owner.
It is intended to sit between the [manager multisig](../../glossary.md#manager-multisig) and [AccessControlRegistry](./accesscontrolregistry.md), effectively making the manager address mutable.
This allows the management of the respective role tree to be transferred along with the OwnableCallForwarder ownership.

Any value sent along with a call to OwnableCallForwarder is forwarded to the target.

> **Warning**
>
> OwnableCallForwarder is not a universal proxy, in that it cannot send and receive all types of calls.
> For instance, it lacks a `receive()` function, meaning it cannot receive ETH.
> Before using OwnableCallForwarder, carefully verify that it supports all the functionalities required for your use-case.
