# Api3ServerV1

> [!NOTE]  
> This document includes the documentation for DataFeedServer, BeaconUpdatesWithSignedData, DapiServer, OevDataFeedServer and OevDapiServer, which together constitute Api3ServerV1.

> [!WARNING]  
> The functionality implemented in OevDataFeedServer and OevDapiServer is deprecated and supplanted by [Api3ServerV1OevExtension](./api3serverv1oevextension.md).
> This document still refers to them as necessary for the sake of completeness.

Api3ServerV1 houses [base feeds](../../glossary.md#base-feed) updated by [Airseekers](../../glossary.md#airseeker) using [signed data](../../glossary.md#signed-data).
Although these base feeds can be read by calling Api3ServerV1 directly, the users are recommended to read them (together with [OEV feeds](../../glossary.md#oev-feed) from Api3ServerV1OevExtension) through [proxy contracts](../../glossary.md#proxy), which implement a convenient interface.

## Asynchronous updates

Api3 [data feeds](../../glossary.md#data-feed) are updated asynchronously for trust-minimization, which is the main difference in their architecture compared to alternative solutions.
Conversely, synchronous updates are preferred because they allow multi-party cryptographic methods to be used for off-chain aggregation, which sacrifices security guarantees to reduce gas costs.

Synchronous updates happen in rounds, where all parties share their version of the truth with each other and then come to a consensus that can be verified on-chain.
In practice, downtime and latency of individual parties are common issues, and thus waiting until all parties report is not a viable option.
However, the alternative to requiring full participation causes a critical vulnerability.

Say that the data from 21 parties are aggregated in a synchronous manner.
It is generally misunderstood that this aggregation can be compromised with at least 11 malicious parties.
However, to avoid data feed-level downtime, data feeds that are updated synchronously are often configured to be able to come to an initial consensus even if some of the parties are late or unavailable.
(For example, 14 out of 21 is often deemed to be adequate for an initial consensus in such a setting.)
This means that in the case that 7 parties are coincidentally unresponsive or even merely late (due to a node bug, a global Cloudflare outage, etc.), 14 parties will be allowed to form an initial consensus, where 7 malicious parties are enough to compromise the data feed.
Therefore, the security guarantees of synchronously updated data feeds are much lower than what the general public is led to believe (in this example, a 34% attack suffices to control the data feed rather than the implied 51%).

As a solution to this issue, Api3ServerV1 enables each [API provider](../../glossary.md#api-provider) to maintain a single-source data feed of their own, a [Beacon](../../glossary.md#beacon), and enables arbitrary combinations of these Beacons to be aggregated on-chain to form [Beacon sets](../../glossary.md#beacon-set).
In the case that an issue debilitates the infrastructure of an API provider, their individual Beacon will stop getting updated, yet its most recent value will continue contributing to the Beacon set aggregation.
Furthermore, since the Beacon is kept on-chain, the other API providers cannot pick-and-choose from older signed data of the absent API provider.
The resulting implementation costs more gas to operate, yet provides a significant improvement to the security guarantees (i.e., can only be compromised with a 51% attack rather than a 34% attack).

As a final note, OevDataFeedServer is updated synchronously to provide exact numerical accuracy, which is necessary to ensure the capture of a specific OEV opportunity.
However, since the reader proxy falls back on the base feed when the OEV feed has not been updated more recently, the OEV feed experiencing an outage does not cause a general outage.
This means that these synchronous updates can feasibly require all parties to participate, in which case the resulting synchronously updated OEV feeds do not degrade the superior security guarantees of asynchronously updated base feeds.

## Data feed timestamps

In the absence of indexed rounds, a type of a nonce is needed for asynchronously updated data feeds.
Api3ServerV1 uses the system time of the machine that runs the respective [Airnode feed](../../glossary.md#airnode-feed) as the nonce.
Each Beacon can only be updated with signed data whose timestamp is larger than the signed data that was used previously.
Since Beacon sets can only be aggregated out of Beacons and the Beacon set timestamp is the median of the timestamps of the respective Beacons, Beacon set timestamps also never decrease.
(As a note, Beacon set updates that keep the timestamp the same are allowed if the aggregation result changes, considering that the contributing Beacon timestamps must have increased.)

Although data feed timestamps are mainly nonces that prevent replay attacks, they have a secondary function of indicating the freshness of the data.
For example, if one expects the [heartbeat](../../glossary.md#heartbeat) interval of a data feed to be one day, they can safely require the respective timestamp to be no older than one day.

As a note, some alternative data feed implementations use the timestamp of the block in which the data feed is updated as the update timestamp.
Since our data feed timestamp is a more realistic measure of freshness, it will lag a few seconds behind this value, which still allows them to be used interchangeably in most cases.
However, this may not be the case if the chain time drifts or the data feed timestamps are misreported.
Since understanding the implications of this difference to the full extent is difficult, the users are not recommended to use the data feed timestamp in their contract logic beyond validating a heartbeat interval requirement.

## dAPIs

The data feed IDs in Api3ServerV1 immutably define a specific aggregation of API calls to respective API providers.
This is the trust-minimized, [first-party oracle](../../glossary.md#first-party-oracles)-based setup.
However, [dApps](../../glossary.md#dapp) often require a fully-managed solution, where the API provider curation and the maintenance of API provider integrations are handled by domain experts.

Api3ServerV1 implements [dAPI](../../glossary.md#dapi) names, which are `bytes32`-type strings that are mapped to the immutable data feed IDs mentioned above.
Accounts that have the "dAPI name setter" role are able to update this mapping, which at this moment are the [manager multisig](../../glossary.md#manager-multisig) and [Api3MarketV2](./api3marketv2.md).
