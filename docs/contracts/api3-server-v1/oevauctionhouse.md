# OevAuctionHouse

OevAuctionHouse implements a general purpose auction platform for a centralized entity to auction off data in a transparent and retrospectively verifiable manner.
API3 uses it to hold [OEV auctions](../../glossary.md#oev-auction) on [OEV Network](../../glossary.md#oev-network), where [searchers](../../glossary.md#searcher) [bid](../../glossary.md#bid) for the privilege to be the only party that can update [OEV feeds](../../glossary.md#oev-feed) of a specific [dApp](../../glossary.md#dapp) for a short duration.

## On-chain auctions

OEV auctions are done on-chain to address two issues:

1. An OEV auction platform greatly incentivizes the participants to create, update and cancel bids at a large volume.
   Considering that we are building the OEV auction platform for all dApps living on all chains, simply scaling up the infrastructure to meet this demand is not realistic, and we should have a mechanism to downregulate the demand.
   This is a long-solved problem in blockchain transactions through the gas fee, and thus hosting the auctions on-chain is an obvious solution to this problem.
2. An OEV auction is an oracle service in essence, for which it is important to be able to prove a good track record.
   For this, a paper trail of the entire communication between the [auctioneers](../../glossary.md#auctioneer) and the searchers need to be kept, and a blockchain is a natural solution to this.
   Consider this for a counterexample:
   A searcher claims that they call the (hypothetical) auctioneer API to make bids that should win, but the auctioneer keeps [awarding](../../glossary.md#award) the updates to other, smaller bids.
   The auctioneer would not be able to disprove this claim, as it is not possible to prove that an API call has not been received, yet whether an on-chain transaction has been confirmed is conclusively verifiable.

## Auction schedule

Each dApp has a single, independent auction track.
When a searcher wins an auction for a dApp, they gain OEV feed update privileges across all [dAPIs](../../glossary.md#dapi) that the dApp uses.
Therefore, this section describes the schedule of a single auction track, which covers all OEV opportunities of a dApp.

Auctions take a fixed amount of time, happen periodically, and are packed tightly.
For example, if the [auction period](../../glossary.md#auction-period) is `T=30`, there will be auctions in `t=0–30`, `t=30–60`, `t=60–90`, etc.
During each auction, searchers bid for OEV update privileges that will be valid during the following auction period.
For example, if a searcher bids during `A1` (which happened in `t=0–30`) and won, they are awarded the right to do OEV updates during `A2`, which will happen in`t=30–60`.

An auction period is split into two phases, [bid](../../glossary.md#bid-phase) and [award phases](../../glossary.md#award-phase), which are packed tightly (e.g., `Tb=25` and `Ta=5`, which add up to `T=30`).
During the bid phase, searchers place their bids.
During the award phase, the auctioneer considers the bids, chooses the winner, and announces the award.
Bids confirmed during the award phase are not considered, and the auctioneer's award transaction is expected to be confirmed before the award phase ends.
The award allows the winner to execute OEV updates until the end of the next bid phase.
For example, if a searcher won `A1`, they are allowed to execute OEV updates as soon as they fetch the award (which is expected to happen during the award phase, i.e. `t=25–30`), and continue doing so until `t=55`, which is when the bid phase of `A2` ends.

### Staggered auctions

Each dApp has a single, independent auction track, with auctions of length `T`.
To distribute the load on the OEV infrastructure across time, these independent auction tracks are staggered.
Where `T` is an integer that represents time in seconds, each auction is offset by `uint256(keccak256(abi.encodePacked(dAppId))) % T`.
For example, say `dappId=156` and `T=30`.
The offset for this dApp will be `uint256(keccak256(abi.encodePacked(156))) % 30 = 24` seconds.
Therefore, for this dApp, a new auction will start at every UNIX timestamp `k * 30 + 24`.

## Collateral and protocol fee

Whenever a bidder wins an auction, OevAuctionHouse locks up some of their funds to charge either a [collateral](../../glossary.md#collateral) or a [protocol fee](../../glossary.md#protocol-fee).
In the case that the winner promptly pays their bid and report that they have done so, they are charged a protocol fee out of the locked funds and the rest of the funds gets released.
Failing to do so results in them being charged a collateral amount and the rest of the funds gets released.

> [!WARNING]  
> Since the initial implementation, we have decided to implement the protocol monetization logic elsewhere.
> As a result, the protocol fee in this contract will be set to zero.
> In the rest of the documentation, we omit the protocol fee, as it has no effect to the flow when it is set to zero.

## Searcher flow

- Call `deposit()` at OevAuctionHouse to deposit funds to be used as collateral.
- Continuously poll the [signed API](../../glossary.md#signed-api) to find and store [signed data](../../glossary.md#signed-data) that can be used to extract OEV.
- Towards the end of each bid phase, calculate the total OEV amount that can be extracted during the next bid phase, and call `placeBid()` to place a bid for it if profitable.
- For each placed bid, check for an award at the end of the respective award phase by listening for the `AwardedBid` event.
- For each award, call `payOevBid()` at [Api3ServerV1OevExtension](./api3serverv1oevextension.md) of the respective chain to pay the bid and assume OEV update privileges.
- Use the previously stored signed data that can extract OEV during the bid phase of the next auction to capture the detected OEV opportunities.
- For each paid bid, call `reportFulfillment()` at OevAuctionHouse to request for the collateral that was locked during the award to be released.

### Finality considerations

- Bid placement transactions must be confirmed in the bid phase for the auctioneer to consider them.
  On the other hand, bidders will prefer to place bids as late as possible to base them on fresh information.
  This means that there is a trade-off to be made regarding how late one should attempt to place their bids.

- OevAuctionHouse is on OEV Network, which currently is an Arbitrum Nitro L2.
  Its sequencing is centralized, with block times of ~250ms.
  Therefore, an OevAuctionHouse interaction can be approximated to an API call under normal conditions, i.e., it will be fairly fast and final.

- Chains on which bids are paid and OEV is extracted may provide weaker finality guarantees.
  It is the bidder's responsibility to wait for adequate finality before calling `reportFulfillment()`.

### Bid expiration

OevAuctionHouse was originally designed for asynchronous auctions with upfront bidding and immediate awards.
However, it was also designed to be flexible enough to support various auction schemes, including the synchronous approach currently in use.
One thing to consider here is that the `expirationTimestamp` specified while calling `placeBid()` and `MAXIMUM_BID_LIFETIME` have become largely obsolete with this switch.

If a searcher is placing a bid during `A1` (i.e., for `t=30–55`), they can set their `expirationTimestamp` to be `55` (i.e., end of the bid phase during which they aim to execute OEV updates).
Any less risks their bid to not be considered due to expiring too soon, and any more risks their bid to be awarded too late.
(The latter should never happen as long as the auctioneer calls `awardBid()` with suitable `awardExpirationTimestamp`.)
In the case that `T` is much smaller than `MAXIMUM_BID_LIFETIME`, `MAXIMUM_BID_LIFETIME` stops becoming a factor and can be safely ignored.

### Denial of service protection

Bidders can attempt to deny service by placing winning bids that satisfy all conditions required to win, and do one of the following while the award transaction is pending:

1. Withdraw deposited collateral
2. Cancel the bid

To prevent the first, withdrawals are done in two steps:
`initiateWithdrawal()` is called first, and `withdraw()` gets called `WITHDRAWAL_WAITING_PERIOD` after that.
Auctioneers will not attempt to award bidders that have a pending withdrawal.
If the withdrawal is initiated while the award transaction is pending, the bid still gets awarded and collateral gets locked up.

To prevent the second, bids cannot be cancelled, but only be expedited to expire at least in the next `MINIMUM_BID_LIFETIME`.
Auctioneers will not attempt to award bids that will expire soon.
If the bid expiration gets expedited while the award transaction is pending, the bid still gets awarded and collateral gets locked up.

## Auctioneer flow

OevAuctionHouse inherits [AccessControlRegistryAdminnedWithManager](../access/accesscontrolregistryadminnedwithmanager.md), through which it defines an auctioneer role.
Multiple accounts can be granted this role, which is allowed to:

1. Award bids (which locks up collateral)
2. Confirm [fulfillments](../../glossary.md#fulfillment), i.e., confirm that awarded bids have been paid for (which releases the collateral)
3. Contradict fulfillments, i.e., contradict that awarded bids have been paid for (which slashes the collateral)

The first of these is done by the "auction resolver" and the last two are done by the "auction cop".

### Auction resolver flow

- At the start of each award phase, fetch `PlacedBid` and `ExpeditedBidExpiration` logs during the respective bid phase.
- Select the highest bid that satisfies all of the following:
  - The bid will not expire within the next `MINIMUM_BID_LIFETIME`
  - The bidder has sufficient deposit to cover the collateral requirement
  - The bidder has not initiated a withdrawal
- For the selected bid, call `awardBid()` at OevAuctionHouse to deliver the signature that will allow the account specified by the bidder to be able to execute OEV updates

### Auction cop flow

- Fetch all `AwardedBid`, `ReportedFulfillment`, `ConfirmedFulfillment` and `ContradictedFulfillment` logs from the last `FULFILLMENT_REPORTING_PERIOD` and continue to periodically fetch them going forward.
- For the bids for which `ReportedFulfillment` is emitted without a matching `ConfirmedFulfillment` or `ContradictedFulfillment`, use `fulfillmentDetails` to check if the bids have been paid on the target chains, and call `confirmFulfillment()` or `contradictFulfillment()`.
- For the bids for which `AwardedBid` is emitted without a matching `ReportedFulfillment` within `FULFILLMENT_REPORTING_PERIOD`, call `contradictFulfillment()`.

### Finality considerations

- While determining the winner of an auction, the auction resolver checks if the highest bidder has sufficient deposit to cover the collateral requirement of their bid.
  However, the bidder can receive another award between this check and the confirmation of the award transaction, which can result in the bidder not having sufficient deposit when the award transaction gets confirmed.
  In this case, the auctioneer should not try awarding another bidder, as the awarded signature will already have been exposed in the reverting award transaction.

- Normally, the auction resolver is expected to deliver the award within the award phase.
  In the case that the delivery is delayed due to networking or finality issues, it is preferable to not lock up the collateral of the bidder.
  For this, auction resolvers should use a sufficiently small `awardExpirationTimestamp` while calling `awardBid()`.
  On the other hand, `awardExpirationTimestamp` should be large enough to ensure that `awardBid()` does not revert erroneously.
  The recommended `awardExpirationTimestamp` value here is the start of the respective award phase plus `T` (the auction length).

- It is assumed that the bidder has waited for sufficient finality before reporting their fulfillment.
  If the auction cop fails to confirm the bid payment due to a finality issue, it will contradict the fulfillment.

### Security implications

An auctioneer is trusted to facilitate the auction honestly (as an alternative to an on-chain order book), which enables the following unwanted scenarios:

- It can deny service (selectively or to everyone) by not awarding bids or not confirming fulfillments.
- It can contradict fulfillments that have been correctly reported.
- It can award bids that should have been beaten by competitors.
- It can provide award details that are not valid.

The purpose of doing the auctions on-chain is for such events (or their lack thereof) to be decisively provable.

Based on the fact that the scenarios above are possible, starting from the moment a bid is created and until the fulfillment is confirmed, the respective collateral is under risk of being slashed unjustly.
Note that the auctioneer role is intended to be given to a hot wallet that a bot controls, while the contract [manager](../../glossary.md#manager) is intended to be a [multisig](../../glossary.md#manager-multisig).
Therefore, in the event of an unjust slashing, the funds become accessible to the multisig, and not the hot wallet.
In such an occasion, the issue is intended to be resolved retrospectively by the multisig based on the on-chain records through an off-chain dispute resolution mechanism.

## Off-chain protocol specs

OevAuctionHouse is agnostic to the conventions used for `bidTopic`, `bidDetails`, `awardDetails` and `fulfillmentReport` for the sake of flexibility.
We refer to these conventions collectively as _off-chain protocol specs_.

### `bidTopic`

Bids related to a specific auction must be placed with a bid topic unique to that auction, and any follow up action (e.g., expediting a bid expiration) must do the same.
This allows the auctioneer dedicated to resolving that auction to be able to filter logs effectively.
This implies that the bidder is responsible for using the correct bid topic, and failing to do so will result in them being ignored.

The following parameters are used to calculate the bid topic:

- `majorVersion`: A positive integer that specifies the major version of the auctioneer.
  Any breaking change in the behavior of the auctioneer, which can involve changes in auction rules or off-chain protocol specs, is denoted by this major version being incremented.
- [`dappId`](../../glossary.md#dapp-id): A positive integer that specifies a dApp on a specific chain.
  A single dApp deployed on multiple chains will have a different `dappId` for each chain deployment.
- `auctionLength`: The [auction period](../../glossary.md#auction-period) in seconds.
- `signedDataTimestampCutoff`: The largest signed data timestamp that the searcher will be allowed to use to update the respective OEV feeds if they win the auction.

The bid topic is calculated as follows:

```js
ethers.utils.keccak256(
  ethers.utils.solidityPack(
    ['uint256', 'uint256', 'uint256', 'uint256'],
    [majorVersion, dappId, auctionLength, signedDataTimestampCutoff]
  )
);
```

By using this bid topic, the bidder confirms the major version that they are operating on, the dApp they are bidding for, and the period during which they will be able to execute OEV updates.
Note that the `signedDataTimestampCutoff` in the bid topic implies that the bid topic changes for every auction.

### `bidDetails`

The bid placement transaction specifies the chain ID and bid amount.
The major version, dApp ID and timestamps are implied by the bid topic.
This means that the bid details need to include the following remaining parameters:

- `updateSenderAddress`: The `msg.sender` address that the Api3ServerV1OevExtension contract will see while `payOevBid()` is being called to pay the bid, and `updateDappOevDataFeed()` is being called to update the OEV feed.
- `nonce`: A unique value added to prevent duplicate bid IDs.

The bid details are encoded as follows:

```js
ethers.utils.defaultAbiCoder.encode(
  ['address', 'bytes32'],
  [updateSenderAddress, ethers.utils.hexlify(ethers.utils.randomBytes(32))]
);
```

### `awardDetails`

The award details is the signature that the winner needs to use while calling `payOevBid()` of Api3ServerV1OevExtension.

### `fulfillmentReport`

The fulfillment report is the hash of the transaction that the winner has sent while calling `payOevBid()`.

### Sealed bids

In a future major version, sealed bids may be supported.
For this, `dappId` and `signedDataTimestampCutoff` would need to be transferred to `bidDetails`, and a non-auction specific `bidTopic` convention would need to be chosen (e.g., `keccak256(abi.encodePacked(majorVersion, auctionLength, auctioneerId))`).
Then, `bidDetails` can simply be `abi.encode(dappId, signedDataTimestampCutoff, updateSenderAddress, nonce)` encrypted using the public key that the auctioneer has announced, e.g., using RSA-4096.
This disables auctioneers from being able to filter logs at the RPC level, which creates the need for a centralized indexer.

## Privileged accounts

The OevAuctionHouse contract specifies an immutable _manager_ address, which belongs to an account that has the privileges to

- Set the protocol fee and collateral requirement proportional to the bid amount,
- Set the addresses of the (proxy) contracts from which the rates of the collateral currency and the native currencies (of the chains on which the OEV updates will be executed) will be read from,
- Withdraw the accumulated protocol fees and slashed collateral,
- Create, grant and revoke the _admin_ role.

An account with the admin role can

- Renounce its admin role,
- Create, grant and revoke the _proxy setter_, _withdrawer_ and _auctioneer_ roles.

An account with the proxy setter role can

- Renounce its proxy setter role,
- Set the addresses of the (proxy) contracts from which the rates of the collateral currency and the native currencies (of the chains on which the OEV updates will be executed) will be read from.

An account with the withdrawer role can

- Renounce its withdrawer role,
- Withdraw the accumulated protocol fees and slashed collateral.

An account with the auctioneer role can

- Renounce its auctioneer role,
- Award a bid and lock up the respective protocol fee and collateral,
- Confirm the fulfillment for an awarded bid, which charges the protocol fee and releases the collateral,
- Contradict the fulfillment for an awarded bid, which slashes the collateral and releases the protocol fee.

Accounts with the auctioneer role are trusted to facilitate the auctions honestly, see [the section above](#security-implications) for the related security implications.

In the way that API3 intends to use this contract, the manager of OevAuctionHouse is an [OwnableCallForwarder](https://github.com/api3dao/airnode-protocol-v1/blob/main/contracts/utils/OwnableCallForwarder.sol) that is owned by a Safe contract (4-of-8 at the time this is being written) that is owned by members of the API3 technical team, which are familiar with how these contracts are designed to be used and general best practices regarding controlling a wallet and interacting with a contract.
This manager account will create the contract admin role, grant it to itself, and then create the auctioneer role as a child of the admin role.
Following this, it will grant the auctioneer role to a set of EOAs that will be used by an auctioneer bot instance each.
Auctioneer bots are, in a way, oracle nodes (in that they detect on-chain oracle requests in the form of bids, do intensive off-chain computation and/or API calls to read off-chain data, and write the response back to the chain), and will be operated by the API3 technical team.
Optionally, the manager can delegate the proxy setting and withdrawing responsibilities to another account (such as a trustless contract) to streamline the respective processes.

## On interacting with OevAuctionHouse through a contract

In the case that an EOA calls OevAuctionHouse directly, `bidder` is the address of this EOA.
This means that the EOA will be able to place bids (by calling `placeBidWithExpiration()` or `placeBid()`), report fulfillments (by calling `reportFulfillment()`), withdraw (by calling `initiateWithdrawal()` and `withdraw()` in succession), or cancel ongoing withdrawals (by calling `cancelWithdrawal()`).

In case that the user wants to limit the privileges of the EOA that interacts with OevAuctionHouse, they can implement a contract that forwards calls to OevAuctionHouse bounded by specific rules.
As a toy example, say we have lended our capital to a searcher bot operator to capture OEV on our behalf.
However, we do not want the bot operator to be able to withdraw our capital.
We could implement a contract that forwards the `placeBidWithExpiration()`, `placeBid()` and `reportFulfillment()` calls from the bot operator EOA, and the `initiateWithdrawal()`, `withdraw()` and `cancelWithdrawal()` calls from our EOA.
(As a note, this does not prevent the bot operator from burning through the funds by placing invalid bids, nor does it guarantee that the bot operator will share the revenue.)

Below are the important points to consider while implementing a contract that calls `placeBidWithExpiration()` and/or `placeBid()`:

- `reportFulfillment()` has to be called by the same account that has placed the bid.
  Therefore, one should design a flow that has the same contract report the respective fulfillments.
- `initiateWithdrawal()` and `withdraw()` has to be called by the same account for which funds were deposited (which is also the account that places the bids).
  Therefore, one should design a flow that has the same contract calls the `initiateWithdrawal()` and `withdraw()` functions in succession to withdraw funds.
  Optionally, `cancelWithdrawal()` support may be implemented.
- The withdrawal recipient is specified in the `withdraw()` call.
  In the case that the recipient is the said contract, it should be `payable` (to execute the withdrawal), and allow funds in the native currency be withdrawn from it.
- Although it may seem like `withdraw()` is the only critical withdrawal-related call because it specifies the recipient and amount, `initiateWithdrawal()` and `cancelWithdrawal()` are also risky to expose.
  For example, a malicious actor that has access to it may call `initiateWithdrawal()` so that the auctioneer bots disregard the respective bids, or call `cancelWithdrawal()` whenever a withdrawal is initiated to prevent the funds from ever being withdrawn.
  Therefore, the said contract should only expose these functions to a trusted EOA or multisig, or in the case that it will expose them to untrusted parties in a restricted fashion, great care must be taken to make sure that doing so will not be abused.
