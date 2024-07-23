# OwnableCallForwarder

OwnableCallForwarder is an Ownable contract that forwards calls made by its owner.
It is designed to serve as a mutable AccessControlRegistry manager, enabling transferrable management of role trees.
Any value sent along with a call to OwnableCallForwarder is forwarded to the target.

> **Warning**
>
> OwnableCallForwarder is not a universal proxy, in that it cannot send and receive all types of calls.
> For instance, it lacks a `receive()` function, meaning it cannot receive ETH.
> Before using OwnableCallForwarder, carefully verify that it supports all the functionalities required for your use case.
