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

## Signed data timing

Being able to determine the OEV opportunities accurately enables searchers to bid competitively, which is critical for effective OEV extraction.
There are two requirements for this:

1. The searcher needs to know exactly what updates they are bidding for.
1. The OEV opportunities that the bid amount calculation is based on should not be capturable through base feed updates or by the winner of the previous auction.

To achieve this, where `T` is one [auction period](../../glossary.md#auction-period) (i.e., 30 seconds), the signed API endpoint that serves the signed data used to execute base feed updates delay the data by `2T`, and the award signature is signed in a way that Api3ServerV1OevExtension allows the auction winner to execute OEV updates with signed data that is at least `T`-old.
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

The winning searcher makes three calls:

1. Using the account whose address that they have specified in their bid details, call `payOevBid()` of Api3ServerV1OevExtension to assume OEV update privileges.
1. Using the same account, call `updateDappOevDataFeedWithAllowedSignedData()` to execute an OEV update.
1. Call the target dApp to extract OEV.

Steps 2 and 3 must be done in a multicall to prevent third-parties from interjecting between and stealing the OEV.
Furthermore, steps 1 and 3 must be done in the same multicall to utilize a flash loan to cover the bid amount.
Therefore, steps 1, 2 and 3 are intended to be done in the same multicall, where steps 2 and 3 can be repeated with different updates.

Since the bid only specifies the address of the contract that is intended to make this multicall, that contract needs to be personalized (e.g., put its interface behind `onlyOwner`) for third-parties to not be able to act on the awarded bid.

## How are the OEV auction proceeds handled?

The OEV auction proceeds will be paid out to the parties that best represent the respective dApps through a protocol that is beyond the scope of the contracts in this repo.
The [manager](../../glossary.md#manager) of this contract or an account that it granted the withdrawer role to can withdraw as much of the OEV auction proceeds as they wish, and send these funds to the respective accounts as necessary.
Considering that OEV proceeds will form a slow and steady flow that will be paid out frequently, this was not seen as a security issue and was preferred for its flexibility.
