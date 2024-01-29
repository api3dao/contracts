# AirseekerRegistry.sol

All API3 data feeds are served over the [Api3ServerV1](./api3serverv1.md) contract.
[Airseeker](../infrastructure/airseeker.md) is a piece of API3 data feed infrastructure that pushes API provider-signed data to Api3ServerV1 when the conditions specified on AirseekerRegistry are satisfied.
In other words, AirseekerRegistry is an on-chain configuration file for Airseeker.
This is preferred for two reasons:

- The reconfiguration of data feed infrastructure through a redeployment or an API call is error-prone and should be avoided.
  On-chain reconfiguration is preferable because it can be restricted according to rules enforced by a contract (e.g., a multisig would require a specific number of signatures), which may reduce the probability of errors and severity of consequences.
- The on-chain reconfiguration can be integrated to other contracts to streamline the process.
  For example, [Api3Market](./api3market.md) automatically updates AirseekerRegistry based on user payments, removing the need for any manual steps.

## How Airseeker uses AirseekerRegistry

Airseeker periodically checks if any of the active data feeds on AirseekerRegistry needs to be updated (according to the on-chain state and respective update parameters), and updates the ones that do.
`activeDataFeed()` is used for this, which returns all data that Airseeker needs about a [data feed](../contracts/api3serverv1.md#data-feeds) with a specific index.
To reduce the number of RPC calls, Airseeker batches these calls using `multicall()`.
The first of these multicalls includes an `activeDataFeedCount()` call, which tells Airseeker how many multicalls it should make to fetch data for all active data feeds (e.g., if Airseeker is making calls in batches of 10 and there are 44 active data feeds, 5 multicalls would need to be made).

In the case that the active data feeds change (in that they become activated/deactivated) while Airseeker is making these multicalls, Airseeker may fetch the same feed in two separate batches, or miss a data feed.
This is deemed acceptable, assuming that active data feeds will not change very frequently and Airseeker will run its update loop very frequently (meaning that any missed data feed will be handled on the next iteration).

Let us go over what `activeDataFeed()` returns.

```solidity
function activeDataFeed(uint256 index)
    external
    view
    returns (
        bytes32 dataFeedId,
        bytes32 dapiName,
        bytes dataFeedDetails,
        int224 dataFeedValue,
        uint32 dataFeedTimestamp,
        int224[] beaconValues,
        uint32[] beaconTimestamps,
        bytes updateParameters,
        string[] signedApiUrls
    )
```

`activeDataFeed()` returns `dataFeedId` and `dapiName`.
`dataFeedId` and `dapiName` are not needed for the update functionality, and are only provided for Airseeker to refer to in its logs.
`dataFeedDetails` is contract ABI-encoded [Airnode address](../specs/airnode-protocol.md#airnode-address) array and template ID array belonging to the [data feed](./api3serverv1.md#data-feeds) identified by `dataFeedId`.
When a [signed API](../infrastructure/signed-api.md) is called through the URL `$SIGNED_API_URL/public/$AIRNODE_ADDRESS`, it returns an array of signed data, which is keyed by template IDs (e.g., https://signed-api.api3.org/public/0xc52EeA00154B4fF1EbbF8Ba39FDe37F1AC3B9Fd4).
Therefore, `dataFeedDetails` is all Airseeker needs to fetch the signed data it will use to update the data feed.

`dataFeedValue` and `dataFeedTimestamp` are the current on-chain values of the data feed identified by `dataFeedId`.
These values are compared with the aggregation of the values returned by the signed APIs to determine if an update is necessary.
`beaconValues` and `beaconTimestamps` are the current values of the constituent [Beacons](./api3serverv1.md#beacon) of the data feed identified by `dataFeedId`.
Airseeker updates data feeds through a multicall of individual calls that update each underlying Beacon, followed by a call that updates the [Beacon set](api3serverv1.md#beacon-set) using the Beacons.
Having the Beacon readings allows Airseeker to predict the outcome of the individual Beacon updates and omit them as necessary (e.g., if the on-chain Beacon value is fresher than what the signed API returns, which guarantees that that Beacon update will revert, Airseeker does not attempt to update that Beacon).

`updateParameters` is contract ABI-encoded update parameters in a format that Airseeker recognizes.
Currently, the only format used is

```solidity
abi.encode(deviationThresholdInPercentage, deviationReference, heartbeatInterval)
```

where

- `deviationThresholdInPercentage`(`uint256`): The minimum deviation in percentage that warrants a data feed update.
  `1e8` corresponds to `100%`.
- `deviationReference`(`int224`): The reference value against which deviation is calculated.
- `heartbeatInterval` (`uint256`): The minimum data feed update age (in seconds) that warrants a data feed update.

However, AirseekerRegistry is agnostic to this format to be future-compatible with other formats that may be introduced.

`signedApiUrls` are a list of signed APIs that correspond to the Airnodes used in the data feed.
To get the signed data for each Airnode address, Airseeker both uses all signed API URLs specified in its configuration file, and the respective signed API URL that may be returned here.

## How to use AirseekerRegistry

AirseekerRegistry is an Ownable contract where the owner cannot transfer or renounce the ownership.
The owner is responsible with leaving the state of this contract in a way that Airseeker expects.
Otherwise, Airseeker behavior is not defined (but it can be expected that the respective data feed will not be updated under any condition).
The points to consider while activating a data feed name are as follow:

- If a dAPI name is being used, it should be set at [Api3ServerV1](./api3serverv1.md)
- The data feed should be registered by calling `registerDataFeed()`.
  If a dAPI name has been used, this should be repeated whenever the dAPI name is updated.
- The update parameters of the data feed should be set by calling `setDataFeedIdUpdateParameters()` or `setDapiNameUpdateParameters()`
- The signed API URLs of the respective Airnodes should be set by calling `setSignedApiUrl()`.
  If a dAPI name has been used, this should be repeated whenever the dAPI name is updated.
  The signed API URL of an Airnode may change, in which case this should be reflected on AirseekerRegistry by calling `setSignedApiUrl()` again.
- The respective [sponsor wallet](../specs/airnode-protocol.md#sponsor-wallets) should be funded

Note that some of the steps above imply a need for maintenance when dAPI names change, signed API URLs change and sponsor wallets run out.
It is recommended to run automated workers to handle these cases, or at least these aspects should be monitored and responsible parties should be alerted when an intervention is needed.

In the case that the AirseekerRegistry owner is a contract (e.g., Api3Market), it should be implemented in a way to enforce these, at least partially (e.g., Api3Market does not force the user to set signed API URLs while activating a data feed by buying a subscription).
In the case that the AirseekerRegistry owner is a multisig or an EOA, either care needs to be taken, or more ideally, a frontend that abstracts these requirements away (by creating a multicall transaction that satisfies all requirements) should be used.
