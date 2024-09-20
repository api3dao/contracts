# Api3ReaderProxyV1

Api3ReaderProxyV1 is the [proxy](../../../glossary.md#proxy) that should be used to read API3 [dAPIs](../../../glossary.md#dapi).
It implements [IApi3ReaderProxy](../../interfaces/iapi3readerproxy.md) as a first-class citizen, and partially implements Chainlink's AggregatorV2V3Interface for convenience (refer to https://github.com/api3dao/migrate-from-chainlink-to-api3 for more information about the latter).

Api3ReaderProxyV1 is a UUPS-upgradeable proxy with a proxy-specific implementation.
This unusual design makes the contract upgradeable while minimizing storage reads at runtime.
To ensure that the implementation and proxy pair is deployed correctly, [Api3ReaderProxyV1Factory](./api3readerproxyv1factory.md) should be used.

While purchasing a [subscription](../../../glossary.md#subscription), the [API3 Market](../../../glossary.md#api3-market) frontend has the user deploy a generic Api3ReaderProxyV1 with the [dApp ID](../../../glossary.md#dapp-id) `1`.
If the [dApp](../../../glossary.md#dapp) wishes to receive [OEV auction](../../../glossary.md#oev-auction) proceeds, they should deploy an Api3ReaderProxyV1 with their own specific dApp ID using the provided graphical interface and use that instead.

## Combining a base feed and an OEV feed

Each Api3ReaderProxyV1 is meant for a dApp to read a dAPI.
When `read()` is called, Api3ReaderProxyV1 first reads the base feed specific to the dAPI from Api3ServerV1.
The base feed provides the strongest availability guarantees possible, as it is allowed to be updated by anyone.
As a side effect of its permissionless nature, the base feed exposes the entire [OEV](../../../glossary.md#oev) to the public.
Then, Api3ReaderProxyV1 reads the OEV feed specific to the dAPI–dApp pair from Api3ServerV1OevExtension.
The OEV feed is only allowed to be updated by the [searcher](../../../glossary.md#searcher) that won the respective OEV auction.
The [signed data](../../../glossary.md#signed-data) for doing OEV feed updates is published earlier than the signed data for doing base feed updates, which prevents the base feed from exposing any OEV given that there are active searchers.

Among the data read from the base feed and the OEV feed, Api3ReaderProxyV1's `read()` function returns the one that has the fresher timestamp, which provides trust-minimized data integrity and availability, and an effective OEV extraction mechanism at the same time.
