# HashRegistry.sol

HashRegistry is a contract that is designed to mirror the governance decisions of a set of EOAs across a large number of chains with minimal operational friction.
For example, this governance decision could be the list of [Airnode addresses](../specs/airnode-protocol.md#airnode-address) that are decided to be used for each [dAPI](api3serverv1.md#dapi).

This governance decision can be formatted as a Merkle tree.
The set of EOAs can then sign the respective Merkle root as the ["dAPI management Merkle root" hash type](./api3market.md#dapi-management-merkle-tree) and publish their signatures.
This would allow anyone to be able to register the Merkle root at any HashRegistry on any chain.

The governance decisions that are registered at HashRegistry can be referred to by other contracts.
For example, the user of such a contract can provide a Merkle root and a matching proof, and the contract would only proceed to verify the Merkle proof if the Merkle root is the currently registered one at HashRegistry.

As the name implies, HashRegistry allows any hash of `bytes32` type to be registered, and is agnostic to if the hash is a Merkle root or something else.

## Why not use Safe?

It is typical for a Safe multisig contract to be used for multi-party governance purposes, yet the default Safe has the following shortcomings:

- Safe uses ERC-712, which does not allow signatures to be replayed across chains.
  Although this is typically a good idea, in the use case mentioned above, it would require the EOAs to sign a message for each chain.
- It is a common occurance for a signer to have to take time off from signing.
  In such cases, Safe requires signers to be swapped out and in through transactions.
  This process is highly security-critical and error-prone, and it would have to be repeated for each chain.

Safe is highly modular, and arguably, the issues above can be resolved by extending it through custom plugins.
That being said, in this case where our needs are highly specific and minimal, we opted for a standalone implementation.
Note that despite being a pseudo-multisig, HashRegistry does not support many commonplace multisig features (ERC-1271, signature threshold, etc.) that are not needed to avoid bloat.

## The owner

HashRegistry has an owner, which can set signers for specific hash types and, and set specific hashes.
The owner can override the decisions of the signers it sets, and thus should be trusted enough to be able to do so.

The ownership can be transferred or revoked similar to a generic Ownable contract, unless this functionality overriden.

### Setting the signers for a hash type

The owner can set signers for each hash type by calling the following function

```solidity
function setSigners(
    bytes32 hashType,
    address[] signers
)
```

HashRegistry is functionally an M-of-M multisig factory, where each hash type represents an individual multisig.
This means that if the owner sets signers for a hash type, all signers must sign the respective hashes for them to be registered.

While registering the signers, the array of signer addresses must be provided in ascending order.
This implies that duplicates are not allowed.

### Setting the hash for a hash type

The owner can override the latest registered hash for a hash type as if they have valid signatures signed with the timestamp of the transaction block by calling the following function

```solidity
function setHash(
    bytes32 hashType,
    bytes32 hashValue
)
```

Differently from [hash registration](#hash-registration), the owner can set a hash value to `bytes32(0)`, which can be used to decommission the hash type.

## Signers

Signers are hash type-specific and set by the owner.
The contract does not store a list of signer addresses to optimize the gas cost of setting signers and validating signatures.
However, the signers do get emitted in the `SetSigners` event.

### Hash signatures

The signers sign the following Ethereum signed message hash to sign a hash

```solidity
ECDSA.toEthSignedMessageHash(
    keccak256(abi.encodePacked(
        hashType,
        hashValue,
        hashTimestamp
    ))
)
```

Note that the signatures are created before the respective hash is registered, and it only matters if the signer is set as a signer during the registration transaction, and not while the signature is being created.

There is no functionality for signers to cancel their signatures through a transaction, as expecting the signer to send this transaction to all instances of HashRegistry would be error-prone.
Instead, the signer can be swapped out to make their signature invalid.

### Delegation signatures

The signers sign the following Ethereum signed message hash to sign a delegation

```solidity
ECDSA.toEthSignedMessageHash(
    keccak256(abi.encodePacked(
        signatureDelegationHashType(),
        delegate,
        delegationEndTimestamp
    ))
)
```

This signature allows the hash signatures of the delegate to be used as a valid replacement of the (delegation) signer across all hash types until the delegation end timestamp.
This does not prevent the (delegation) signer from continuing to sign hashes.

There is no functionality for (delegation) signers to cancel their delegations through a transaction, as expecting the signer to send this transaction to all instances of HashRegistry would be error-prone.
Instead, the signer can be swapped out to make their delegation invalid.

Delegations apply across all instances of HashRegistry, unless for inheriting contracts that have overriden `signatureDelegationHashType()`.

## Hashes

A hash is of `bytes32` type, and is always stored with a timestamp, which acts as a nonce.
Each registered hash must increase the timestamp.

Each hash type is identified by a `bytes32` type, and only one hash is registered for each hash type at a time.

### Hash registration

Anyone can call the following function to register a hash

```solidity
function registerHash(
    bytes32 hashType,
    bytes32 hashValue,
    uint256 hashTimestamp,
    bytes[] calldata signatures
)
```

The signatures must be provided by the respective signers of the hash type, sorted for the signer addresses to be in ascending order.

Each signature can be an ECDSA signature by the signer, or the delegation end timestamp, delegation signature (by the signer of the hash type) and hash signature (by the delegate) as follows:

```solidity
abi.encode(
    delegationEndTimestamp,
    delegationSignature,
    hashSignature
)
```

## Inheriting HashRegistry

HashRegistry allows its users to derive the hash types with any arbitrary convention.
If the user or inheriting contracts desire the hash types to be domain-specific, they can enforce them to be so.
For example

```sol
bytes32 public constant DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE =
    keccak256(abi.encodePacked("dAPI management Merkle root"));
```

is a generic hash type, while

```sol
bytes32 public constant DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE =
    keccak256(abi.encodePacked(block.chainid, "dAPI management Merkle root"));
```

would be chain-specific.
The user or inheriting contracts should decide which serves their use-case better.

Inheriting contracts can override `signatureDelegationHashType()` to have an independent track of delegations.
In that case, the signers must use the new signature delegation hash type while signing delegations for them to be valid.

## Operating a HashRegistry

HashRegistry is used to enact governance decisions.
Although this depends on the use-case, new decisions not being enacted is typically a security issue.
Furthermore, in the case that there is a list of unregistered eligible hashes, anyone can register these whenever they want and possibly by omitting some of them while doing so, which is again a security issue whose severity depends on the use-case.

The universal recommendation that can be given here is to register any hash relating to your use-case as soon as possible.
This can be done by making the registration of the hashes be the responsibility of the signers (evidently, they were incentivized enough to sign) and non-signers (which may also have an interest in the registered hashes being up to date).
Furthermore, one could devise a scheme that awards hash registrations and depend on third-parties to keep the registered hashes up to date.
