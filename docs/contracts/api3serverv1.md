# Api3ServerV1.sol

Api3ServerV1 houses the data feeds updated by API3's [Airnode protocol](../specs/airnode-protocol.md).
Although these data feeds can be read by calling Api3ServerV1 directly, the users are recommended to read them through proxy contracts, which provide a simple and standard interface.

## Data feeds

Api3ServerV1 enables different kinds of data feeds.
[Beacons](#beacon) are identified by Beacon IDs, and [Beacon sets](#beacon-set) are identified by Beacon set IDs.
The Api3ServerV1 does not make a distinction between Beacon IDs and Beacon set IDs for flexibility (e.g., for the user contracts to not need to know if a data feed they are reading is a Beacon or a Beacon set and make arrangements for that).
In the case that there is such an ambiguity, the value that may be a Beacon ID or a Beacon set ID is referred to as a data feed ID.

A data feed ID is immutable (i.e., it always points to the same Beacon or Beacon set).
Api3ServerV1 allows a [dAPI](#dapi) name to be pointed to a data feed ID by privileged accounts to implement a mutable data feed addressing scheme.

### Beacon

Beacon is a single-source data feed.
Api3ServerV1 allows Beacons to be read individually, or arbitrary combinations of them to be aggregated on-chain to form multiple-source data feeds, which are called Beacon sets.
Beacons are identified by the hash of the [Airnode](../infrastructure/airnode.md) address and the request template ID.

```sol
beaconId = keccak256(abi.encodePacked(airnode, templateId));
```

### Beacon set

Beacon sets are Beacons that are aggregated on-chain to form multiple-source data feeds.
Beacons are identified by the hash of the constituting Beacon IDs.

```sol
beaconSetId = keccak256(abi.encode(beaconIds));
```

### dAPI

dAPIs are implemented by labeling Beacons and Beacon set IDs with names.
dAPI names are `bytes32` type encoded strings.
