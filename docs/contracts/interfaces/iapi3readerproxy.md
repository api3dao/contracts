# IApi3ReaderProxy

API3 data feeds are recommended to be read by calling the respective [proxy](../../glossary.md#proxy) through the IApi3ReaderProxy interface.
The current proxy implementation, [Api3ReaderProxyV1](../api3-server-v1/proxies/api3readerproxyv1.md), implements IApi3ReaderProxy.
It is intended for the future upgrades of Api3ReaderProxyV1 to also implement IApi3ReaderProxy, which means that using IApi3ReaderProxy should be future-proof.
