# Api3ServerV1OevExtension

Api3ServerV1OevExtension extends [Api3ServerV1](./api3serverv1.md) and implements [OEV](../../glossary.md#oev) functionality, supplanting OevDataFeedServer and OevDapiServer.
Api3ServerV1OevExtension houses [OEV feeds](../../glossary.md#oev-feed) updated by [searchers](../../glossary.md#searcher) that win the respective [OEV auctions](../../glossary.md#oev-auction).
Although these OEV feeds can be read by calling Api3ServerV1OevExtension directly, the users are recommended to read them (together with [base feeds](../../glossary.md#base-feed) from Api3ServerV1) through [proxy contracts](../../glossary.md#proxy), which implement a convenient interface.

## How do OEV feeds get updated?

The base feeds of Api3ServerV1 can be updated by anyone using the [signed data](../../glossary.md#signed-data) served by the respective [signed APIs](../../glossary.md#signed-api).
The OEV feeds of Api3ServerV1OevExtension are similar in that they are also updated using signed data fetched from signed APIs.
However, to be able to execute these updates, one needs to have won an OEV auction and paid the respective [bid](../../glossary.md#bid) amount.

While placing a bid at [OevAuctionHouse](./oevauctionhouse.md), a searcher basically states "I want the account with the address `0x1234....cdef` to be able to update the OEV feeds of the dApp with ID `1337` using signed data whose [timestamp](./api3serverv1.md#data-feed-timestamps) is at most `1726848498`, and I am willing to pay `10 ETH` to be able to do so."
If the searcher has [deposited](../../glossary.md#deposit) enough [collateral](../../glossary.md#collateral) and `10 ETH` is the largest bid amount, the [auction resolver](../../glossary.md#auction-resolver) responds with an [award](../../glossary.md#award) transaction, which includes a signature that states "I allow the account with address `0x1234....cdef` to be able to update the OEV feeds of the dApp with ID `1337` using signed data whose timestamp is at most `1726848498` if it pays `10 ETH`."
The searcher can then use the account with the address `0x1234....cdef` to call `payOevBid()` of Api3ServerV1OevExtension and pay `10 ETH`, which allows the same account to update the respective OEV feeds using signed data with the timestamp limitation.

One thing to note here is that [Airnode feed](../../glossary.md#airnode-feed) signs each data point twice, where one signature can be used to update the base feed, and the other can be used to update OEV feed.
Then, the signed API that serves these signatures delays publishing the signature that updates the base feed for 1 minute.
Therefore, having obtained a signature that allows one to update the OEV feeds of a dApp enables one to reliably design the order of events around data feed updates, and thus capitalize on the respective OEV opportunities.

## Backloaded OEV bid payment

Assuming that there will be multiple competitive searchers, the winning bid amounts are expected to be comparable to the OEV revenue.
For effective OEV extraction, the searchers should be able to use the OEV revenue while paying the bid amount, so that bidding large amounts does not require a large capital.

A potential approach here is for the searcher to take out a flash loan, pay the OEV bid amount, extract the OEV and pay back the flash loan.
This is not desirable for two reasons:

1. The availability of a flash loan service becomes an absolute requirement for paying OEV bid amounts.
2. The OEV extraction operation itself (e.g., liquidating a borrower) often requires taking out a flash loan, and most services do not support nested flash loans due to using basic reentrancy guards.

As a solution, we use backloaded OEV bid payments, where we allow OEV feed updates under the condition that the bid amount will be paid before the transaction is over.
This is implemented similarly to [ERC-3156](https://eips.ethereum.org/EIPS/eip-3156), where `payOevBid()` is called by the update sender contract specified in the bid, whose `onOevBidPayment()` function is called back to extract the OEV and pay the bid amount before returning.

As a note, `payOevBid()` has a reentrancy guard similar to flash loan lender contracts, which implies that one cannot pay OEV bids in a nested way.
An alternative approach here is to handle the reentrancies explicitly rather than blocking them off altogether, yet we decided against this for the sake of simplicity.
Note that the following flow is still possible, even if computing the loan amount will be somewhat impractical:

- Take out a large flash loan.
- Call `payOevBid()` multiple times with callbacks that only pay the bid amount with the loan.
- Extract the OEV with the remainder of the loan.
- Pay back the loan out of the extracted OEV.

## Signed data timing

Being able to determine the OEV opportunities accurately enables searchers to bid competitively, which is critical for effective OEV extraction.
There are two requirements for this:

1. The searcher needs to know exactly what updates they are bidding for.
1. The OEV opportunities that the bid amount calculation is based on should not be capturable through base feed updates or by the winner of the previous auction.

To achieve this, where `T` is one [auction period](../../glossary.md#auction-period) (i.e., 30 seconds), the signed API endpoint that serves the signed data used to execute base feed updates delays the data by `2T`, and the award signature is signed in a way that Api3ServerV1OevExtension allows the auction winner to execute OEV updates with signed data that is at least `T`-old.
In other words, there are three uses of signed data across time:

1. Signed API publishes real-time data signed to allow the auction winner to execute OEV feed updates.
   Searchers use this to [simulate](#simulating-oev-extraction) OEV feed updates to determine their bid amounts.
1. Searchers that have placed any bids based on the data above store the published data, and use them to [execute](#executing-oev-extraction) OEV updates in case they win the auction.
1. Signed API publishes `2T`-delayed data signed to allow anyone to execute base feed updates.
   This is used for regular [MEV](../../glossary.md#mev) extraction and upholding data feed specs such as [deviation](../../glossary.md#deviation) threshold and [heartbeat](../../glossary.md#heartbeat) interval.

## Simulating OEV extraction

Api3ServerV1OevExtension implements two functions, `simulateDappOevDataFeedUpdate()` and `simulateExternalCall()`, for searchers to be able to simulate OEV extraction with real-time signed data.
Both of these functions can only be called by `address(0)`, i.e., the searcher is intended to call these using `eth_call` while impersonating `address(0)`.

`simulateDappOevDataFeedUpdate()` allows the searcher to simulate OEV feed updates with real-time signed data without any further requirements.
`simulateExternalCall()` allows the searcher to call their OEV extraction contract (e.g., one that liquidates positions making use of flash loans) in the same multicall that has called `simulateDappOevDataFeedUpdate()` before and return data that will inform the searcher of the expected revenue from OEV, which they will use to decide their bid amount.

## Executing OEV extraction

The searcher is intended to implement an OEV extraction contract, whose address is specified as the [update sender address](./oevauctionhouse.md#biddetails) in their bid.
Upon winning, the searcher calls their OEV extraction contract for it to call `payOevBid()` of Api3ServerV1OevExtension.
Api3ServerV1OevExtension calls `onOevBidPayment()` of the OEV extraction contract back with data that was passed to it by the OEV extraction contract.
At this point, the OEV extraction contract is allowed to update the respective OEV feeds by calling `updateDappOevDataFeed()`, and thus can capture the targeted OEV opportunities.
Before returning, the OEV extraction contract must ensure that Api3ServerV1OevExtension is sent at least the bid amount.
Failing to pay the bid amount before returning will cause the transaction to revert.

As an alternative to the intended flow, it is possible for the OEV extraction contract to call `payOevBid()` with a callback that only pays the bid amount, and extract the OEV outside of the `payOevBid()` callback.
This approach is not advised as it does not allow the bid amount to be paid out of the extracted OEV.

## How are the OEV auction proceeds handled?

The OEV auction proceeds will be paid out to the parties that best represent the respective dApps through a protocol that is beyond the scope of the contracts in this repo.
The [manager](../../glossary.md#manager) of this contract or an account that it granted the withdrawer role to can withdraw as much of the OEV auction proceeds as they wish, and send these funds to the respective accounts as necessary.
Considering that OEV proceeds will form a slow and steady flow that will be paid out frequently, this was not seen as a security issue and was preferred for its flexibility.
