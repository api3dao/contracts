# Api3Market.sol

API3 users interact with Api3Market over the [API3 market frontend](https://market.api3.org) to purchase data feed subscriptions.
Api3Market deploys an [AirseekerRegistry](./airseekerregistry.md) that it owns in its constructor.
The user interactions update AirseekerRegistry, which immediately reconfigures the respective [Airseeker](../infrastructure/airseeker.md).
For example, buying a subscription for a [dAPI](./api3serverv1.md#dapi) that is currently deactivated will activate it and set its update parameters to the ones from the subscription, causing Airseeker to immediately start executing updates as specified.

## The owner

Api3Market inherits [HashRegistry](./hashregistry.md), which inherits Ownable, which means Api3Market has an owner.
Unlike HashRegistry, the Api3Market ownership cannot be transferred or renounced (i.e., the owner specified at the deployment is immutable).
Api3Market does not use the ownership functionality, which means that the owner is solely used for [HashRegistry functionality](./hashregistry.md#the-owner), which is setting signers for a hash type or setting a hash.

## Merkle roots as HashRegistry hash types

Api3Market uses three types of HashRegistry hash types:

- dAPI management Merkle root
- dAPI pricing Merkle root
- Signed API URL Merkle root

As the names imply, each is the root of a Merkle tree that contains the respective data.
The Api3Market owner can set different signers for each of these.

## Merkle trees

Api3Market enables API3 to predetermine the decisions related to its data feed services and publish them on-chain in the form of roots of Merkle trees.
These Merkle trees are then published for the users to be able to provide the respective Merkle proofs while interacting with Api3Market.

`@openzeppelin/merkle-tree` is used to generate the Merkle trees, and Api3Market uses OpenZeppelin's MerkleProof contract library to verify the proofs.

### dAPI management Merkle tree

The leaves of the dAPI management Merkle tree is the hash of the following values:

- dAPI name (`bytes32`): An immutable name that describes what data the dAPI provides (e.g., `ETH/USD`).
- Data feed ID (`bytes32`): The ID of the [data feed](./api3serverv1.md#data-feeds) that the dAPI is to be pointed at.
  Cannot specify a [Beacon set](./api3serverv1.md#beacon-set) with more than 21 [Beacons](./api3serverv1.md#beacon).
- dAPI sponsor wallet address (`address`): The address of the [sponsor wallet](../specs/airnode-protocol.md#sponsor-wallets) that will send the dAPI update transactions.

Each dAPI name in a dAPI management Merkle tree is intended to be unique.

The dAPI sponsor wallet address is derived out of the extended public key of the API3 Airseeker and the dAPI name, meaning that it will be unique per dAPI name.

In the case that a dAPI name is being commissioned, rather than omitting it in the future iterations of the tree, it should be left in permanently with a `bytes32(0)` data feed ID and `address(0)` sponsor wallet address instead.

### dAPI pricing Merkle tree

The leaves of the dAPI pricing Merkle tree is the hash of the following values:

- dAPI name (`bytes32`): An immutable name that describes what data the dAPI provides (e.g., `ETH/USD`)
- Chain ID (`uint256`): The ID of the chain for which the price will apply
- dAPI update parameters (`bytes`): Encoded update parameters. Unlike AirseekerRegistry, Api3Market expects the update parameters to have an exact format.
  Refer to the [example `updateParameters` format in AirseekerRegistry docs](./airseekerregistry.md#how-airseeker-uses-airseekerregistry).
- Duration (`uint256`): Subscription duration in seconds.
- Price (`uint256`): Subscription price in Wei, denominated in the native currency of the chain with the ID.

Each (dAPI name, chain ID, dAPI update parameters, duration) tuple in a dAPI pricing Merkle tree is intended to be unique.

The dAPI update parameters for a (dAPI name, chain ID) should be comparable, in that they should be objectively superior/inferior to one another.
Otherwise, a subscription having been purchased may block the purchase of another one with incomparable update parameters until it expires because it will not be clear if the purchased subscription should override the current one or not.

#### How are prices determined?

API3 does not intend to monetize data feed operation.
Instead, an operation cost is estimated for each subscription, and this exact amount is offered as the respective price.
In the case of underpricing, which will cause the sponsor wallet to run out before the subscription period ends, API3 will top up the sponsor wallet to uphold the advertised specs.
In the case of overpricing, the funds will roll over to the next subscription purchase that uses the same sponsor wallet.

### Signed API URL Merkle tree

The leaves of the signed API URL Merkle tree is the hash of the following values:

- Airnode address (`address`): [Airnode address](../specs/airnode-protocol.md#airnode-address)
- Signed API URL (`string`): The URL of the [signed API](../infrastructure/signed-api.md) that serves the data signed by the Airnode.
  Cannot be longer than 256 characters.

Each Airnode address in a signed API URL Merkle tree is intended to be unique.

## Buying a subscription

The user needs to prepare the states of [Api3ServerV1](./api3serverv1.md) and [AirseekerRegistry](./airseekerregistry.md), and provide the respective Merkle proofs to buy a subscription.
Since this is too complex for most users, they are recommended to interact with Api3Market only over the API3 Market frontend, which abstracts away this complexity.
This section describes what happens under the hood of the API3 Market frontend.

The requirements for a `buySubscription()` call to succeed are as follow:

- The `dapiManagementMerkleData` and `dapiPricingMerkleData`, which prove that the rest of the arguments are from the Merkle trees whose roots are currently registered on Api3Market, are valid
- The subscription can be added to the queue of the dAPI, which means that it objectively improves the queue and does not cause it to exceed the maximum limit of 5 items
- The data feed is registered at AirseekerRegistry
- The data feed has been updated at most a day ago
- The call sends enough funds that when forwarded to the sponsor wallet, the balance of the sponsor wallet exceeds what `computeExpectedSponsorWalletBalanceAfterSubscriptionIsAdded()` returns

The user should first fetch the Merkle leaf values and proofs for the subscription they wish to purchase, and call `computeExpectedSponsorWalletBalanceAfterSubscriptionIsAdded()` with the arguments.
This call reverting indicates that the subscription cannot be added to the queue of the dAPI, so the subscription cannot be purchased.
In the case that it does not revert, the user should check the sponsor wallet balance to find out how much they need to pay for the subscription (if any).
Here, it is a good practice overestimate for the probability of the sponsor wallet sending a transaction before the subscription purchase can be confirmed.
For example, say the sponsor wallet balance is `1 ETH`, `computeExpectedSponsorWalletBalanceAfterSubscriptionIsAdded()` result is `2 ETH`, and the user is buying a 30 day subscription whose price is `1.5 ETH`.
The daily price of the subscription would be `1.5 / 30 = 0.05 ETH`, which would be a decent headroom.
Then, instead of `2 - 1 = 1 ETH`, the user could send `1 + 0.05 = 1.05 ETH`, which would be very unlikely to revert, granted that the price is accurate.

Before making the `buySubscription()` call, the user should make sure that the data feed is registered at AirseekerRegistry and the data feed has been updated in the last day at Api3ServerV1.
For that, they can call `getDataFeedData()`.
If the data feed needs to be registered and/or updated, these can be done in a single multicall that finally calls `buySubscription()`.
The data feed details needed to register the data feed would most likely be fetched from the same source that serves the Merkle tree data, and the signed data needed to update the data feed would be fetched from a signed API.

One thing to note here is that data feed updates revert when they are not successful (e.g., because another party updated the data feed with data whose timestamp is more recent than what the user has attempted to use), and thus the multicall should be done through a `tryMulticall()`.
Another pitfall here is that calling `eth_estimateGas` with `tryMulticall()` will return an arbitrary amount (because `eth_estimateGas` looks for a gas limit that causes the transaction to not revert and `tryMulticall()` never reverts by design), which is why the `eth_estimateGas` call should be done with `multicall()`.

## Operating Api3Market

As the [HashRegistry docs](./hashregistry.md#operating-a-hashregistry) instruct, it is a best practice to register each newly signed [Merkle root](#merkle-roots-as-hashregistry-hash-types) as soon as possible (and simultaneously update the sources from which the users will [fetch Merkle tree data to buy subscriptions](#buying-a-subscription)).
Although doing so ensures that following subscription purchases will use the new Merkle tree data, the update does not apply to previous subscriptions automatically.
Specifically, `updateDapiName()` should be called whenever it does not revert for an active dAPI (and this may also require `registerDataFeed()` to be called and the respective data feed to be updated in the same multicall).

As a subscription expires (i.e., the block timestamp reaches its end timestamp), the current subscription ID needs to be updated.
Any subscription purchase for the same dAPI does this automatically, yet `updateCurrentSubscriptionId()` should be called whenever it does not revert for an active dAPI for this to be done as soon as possible.
Otherwise, the data feed will be updated at a frequency higher than what was paid for, which may result in the respective sponsor wallet running out of funds earlier than estimated.

Signed API URL registrations are not required for subscription purchases.
Therefore, calling `updateSignedApiUrl()` for any Airnode address related to an active dAPI whenever it does not revert is the only way of keeping up to date with these.

Finally, charging a subscription price for a set duration implies a service guarantee, which may not be upheld if the price has been underestimated (e.g., a gas spike causes the sponsor wallet to be depleted before what is predicted).
Against this, the sponsor wallet balance of each dAPI should be kept at a level close to what the respective `computeExpectedSponsorWalletBalance()` call returns.
