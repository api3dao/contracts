# Api3ReaderProxyV1

Api3ReaderProxyV1 is the [proxy](../../../glossary.md#proxy) that should be used to read API3 [dAPIs](../../../glossary.md#dapi).
It implements [IApi3ReaderProxy](../../interfaces/iapi3readerproxy.md) as a first-class citizen, and partially implements Chainlink's AggregatorV2V3Interface for convenience (refer to https://github.com/api3dao/migrate-from-chainlink-to-api3 for more information about the latter).

Api3ReaderProxyV1 is a UUPS-upgradeable proxy with a proxy-specific implementation.
This unusual design makes the contract upgradeable while minimizing storage reads at runtime.
To ensure that the implementation and proxy pair is deployed correctly, [Api3ReaderProxyV1Factory](./api3readerproxyv1factory.md) should be used.

While purchasing a [subscription](../../../glossary.md#subscription), the [API3 Market](../../../glossary.md#api3-market) frontend has the user deploy a generic Api3ReaderProxyV1 with the [dApp ID](../../../glossary.md#dapp-id) `1`.
If the [dApp](../../../glossary.md#dapp) wishes to receive [OEV auction](../../../glossary.md#oev-auction) proceeds, they should deploy an Api3ReaderProxyV1 with their own specific dApp ID using the provided graphical interface and use that instead.
