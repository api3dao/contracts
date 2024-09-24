# Glossary

## Admin role

The access control contracts in this repo uses the term "admin role" in two different contexts:

1. `adminRole` in [AccessControlRegistry](./contracts/access/accesscontrolregistry.md), in the same way that OpenZeppelin uses it in AccessControl (i.e., if Role A is the admin role of Role B, accounts that have Role A can grant and revoke Role B)
2. `adminRole` in [AccessControlRegistryAdminned](./contracts/access/accesscontrolregistryadminned.md) and [AccessControlRegistryAdminnedWithManager](./contracts/access/accesscontrolregistryadminnedwithmanager.md), referring to the abstraction layer between the [root role](#root-role) and the contract-specific roles.
   This is also what AccessControlRegistry**Adminned** and AccessControlRegistry**Adminned**WithManager refer to.

## Airnode

[Airnode](https://github.com/api3dao/airnode) is a [first-party oracle](#first-party-oracles) node designed to be operated by [API providers](#api-provider).
The on-chain counterpart of Airnode is referred to as the [Airnode protocol](#airnode-protocol).

## Airnode ABI

To decode a bytes string that was encoded with contract ABI, one needs to know the schema used while encoding.
[Airnode ABI](https://github.com/api3dao/airnode/tree/master/packages/airnode-abi) is a specification built on contract ABI to allow encoding without knowing the schema for [Airnode protocol](#airnode-protocol) purposes.

## Airnode address

All [Airnode protocols](#airnode-protocol) involve the [API provider](#api-provider) [signing their data](#signed-data) with an EOA wallet.
The address of this wallet is referred to as `airnode` in the contracts and is announced by the respective API provider in the DNS records of the base URL of their API.

## Airnode feed

[_Airnode feed_](https://github.com/api3dao/signed-api/tree/main/packages/airnode-feed) is an iteration on Airnode that is optimized to power data feeds.
It supports much larger bandwidth (i.e., number of data feeds that can be supported simultaneously) and lower latency.

## Airnode protocol

Airnode protocol refers to a range of protocols that are used by [Airnode](#airnode) and [Airnode feed](#airnode-feed).
Some examples are:

- [Request–response protocol](https://github.com/api3dao/airnode/tree/master/packages/airnode-protocol): Airnode detects generic on-chain requests and responds by fulfillment transactions
- [Publish–subscribe protocol](https://github.com/api3dao/airnode-protocol-v1/blob/main/contracts/api3-server-v1/extensions/DataFeedUpdatesWithPsp.sol): Airnode detects generic on-chain subscriptions and fulfills them whenever their specified conditions are satisfied
- [Airseeker](#airseeker) protocol: Airnode feed pre-emptively pushes [signed data](#signed-data) to a [signed API](#signed-api), and Airseeker periodically fetches this data from the signed API to update on-chain [data feeds](#data-feed) whenever the conditions specified by the respective [update parameters](#update-parameters) are satisfied

## Airseeker

[Airseeker](https://github.com/api3dao/airseeker) is an application that periodically fetches [signed data](#signed-data) from [signed APIs](#signed-api) to update [data feeds](#data-feed) whenever the conditions specified by the [update parameters](#update-parameters) in the respective [AirseekerRegistry](./contracts/api3-server-v1/airseekerregistry.md) are satisfied.
In the case that the signed APIs are publicly accessible, anyone can operate an Airseeker against any AirseekerRegistry for redundancy.

## API provider

An API provider is a business that has productized their services in the form of an API.

## API3 Market

API3 Market is a dApp where users can purchase [dAPI](#dapi) plans, which get reflected on-chain immediately.

## Auctioneer

An auctioneer is an account that has the auctioneer role on [OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md).
Auctioneers are hot wallets used in [auctioner resolvers](#auction-resolver) and [auction cops](#auction-cop), which are managed by API3 to facilitate [OEV aucitons](#oev-auction).

## Auction cop

Auction cop is an application that confirms or contradicts [fulfillments](#fulfillment) related to [awarded](#award) [OEV auctions](#oev-auction).
In other words, it slashes the [collateral](#collateral) of winning OEV auction participants that did not pay their [bid](#bid) amounts.
An auction cop controls a hot wallet that has the [auctioneer](#auctioneer) role on [OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md).

## Auction period

OEV auctions take a fixed amount of time, happen periodically, and are packed tightly.
The amount of time that an auction takes is called the auction period.

## Auction resolver

Auction resolver is an application that [awards](#award) [bids](#bid) placed on an [OEV auction](#oev-auction).
An auction resolver controls a hot wallet that has the [auctioneer](#auctioneer) role on [OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md) and [Api3ServerV1OevExtension](./contracts/api3-server-v1/api3serverv1oevextension.md).

## Award

At the end of an [OEV auction](#oev-auction), the respective [auction resolver](#auction-resolver) responds with an award transaction.
This award transaction provides a signature that allows the [searcher](#searcher) that has placed the winning [bid](#bid) to be able to update [OEV feeds](#oev-feed) on [Api3ServerV1OevExtension](./contracts/api3-server-v1/api3serverv1oevextension.md), given that they have paid their bid amount.

## Award phase

Award phase is the second phase of an [OEV auction](#oev-auction) where [auction resolves](#auction-resolver) are supposed to [award](#award) [searchers'](#searcher) [bids](#bid).
It is preceded by the [bid phase](#bid-phase).

## Base feed

Each [data feed](#data-feed) has a [base version](#base-feed) that lives in [Api3ServerV1](./contracts/api3-server-v1/api3serverv1.md), and an [OEV version](#oev-feed) that lives in [Api3ServerV1OevExtension](./contracts/api3-server-v1/api3serverv1oevextension.md).
The base feed can be updated by anyone at will by using the [signed data](#signed-data) served by the [signed API](#signed-api).

## Beacon

A Beacon is a single-source [data feed](#data-feed).
A Beacon is identified by the respective [Airnode address](#airnode-address) and [template](#template) ID.

```solidity
beaconId = keccak256(abi.encodePacked(airnode, templateId));
```

[Api3ServerV1](./contracts/api3-server-v1/api3serverv1.md) allows Beacons to be read individually, or arbitrary combinations of them to be aggregated on-chain to form multiple-source data feeds, which are called [Beacon sets](#beacon-set).

## Beacon set

A Beacon set is an on-chain aggregation of [Beacons](#beacon).
A Beacon set is identified by the hash of the constituting Beacon IDs.

```solidity
beaconSetId = keccak256(abi.encode(beaconIds));
```

## Beneficiary

> [!WARNING]  
> This concept is deprecated as the OEV functionality implemented in [Api3ServerV1](./contracts/api3-server-v1/api3serverv1.md) is supplanted by [Api3ServerV1OevExtension](./contracts/api3-server-v1/api3serverv1oevextension.md).

In a previous OEV implementation, [dApps](#dapp) used DapiProxyWithOev/DataFeedProxyWithOev as [proxies](#proxy).
The OEV proceeds accumulated in Api3ServerV1, and the beneficiary address that was specified by a proxy was allowed to withdraw the respective OEV proceeds.
In short, the beneficiary is the account that a dApp specified as the recipient of its OEV proceeds.

## Bid

By placing a bid on [OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md), a [searcher](#searcher) signals to the [auctioneers](#auctioneer) that they want to participate in an [OEV auction](#oev-auction).
Most generally, the bid specifies what update the searcher wants to do and how much they are willing to pay for that.

## Bid phase

Bid phase is the first phase of an [OEV auction](#oev-auction) where [searchers](#searcher) are supposed to place their [bids](#bid).
It is followed by the [award phase](#award-phase).

## Collateral

> [!WARNING]  
> The description below assumes that the [protocol fee](#protocol-fee) is deprecated and will be set to zero.

[OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md) specifies that a percentage of the [bid](#bid) amount will be used as collateral.
While an [auction resolver](#auction-resolver) [awards](#award) a [bid](#bid), the collateral amount derived from the respective bid amount gets locked.
Then, the [searcher](#searcher) needs to pay the bid on [Api3ServerV1OevExtension](./contracts/api3-server-v1/api3serverv1oevextension.md) and report their [fulfillment](#fulfillment).
This is followed by an [auction cop](#auction-cop) confirming the fulfillment, which releases the collateral, or contradicting the fulfillment, which slashes the collateral.

## dAPI

The [API3 whitepaper](https://github.com/api3dao/api3-whitepaper/blob/master/api3-whitepaper.pdf) definition of a dAPI is a [first-party oracle](#first-party-oracles)-based data feed that is managed decentrally.

The [Api3ServerV1](./contracts/api3-server-v1/api3serverv1.md) implementation of this concept is simply an abstraction layer that maps `bytes32` strings to [data feed](#data-feed) IDs, which is managed by a dAPI name setter role.

## dApp

We use the term dApp interchangeably to refer to the whole entity, its implementation, or specifically, its contract implementation.

## dApp ID

API3 holds separate [OEV auctions](#oev-auction) for different [dApps](#dapp) to be able to keep their proceeds isolated.
In this scheme, dApps are identified by IDs that are assigned by API3.
The dApps are required to use [proxies](#proxy) with the respective dApp IDs to receive any OEV proceeds.

## Data feed

Where whether we are referring to a [Beacon](#beacon) or a [Beacon set](#beacon-set) does not matter, we use the term data feed.
For example, since a [dAPI](#dapi) can be pointed to a Beacon ID or a Beacon set ID, we simply say that a dAPI can be pointed to a data feed ID.

## Delegation

In the context of [HashRegistry](./contracts/access/hashregistry.md), a signer can delegate its signing responsibilities to another account, which will affect contracts that use the respective delegation hash type.

## Deposit

Used to refer to the funds a [searcher](#searcher) deposits to [OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md) to be used as [collateral](#collateral) when they are [awarded](#award) an [auction](#oev-auction).

## Deviation

Deviation is the difference between the on-chain value of a [data feed](#data-feed) and its off-chain value based on the data served by [signed APIs](#signed-api).
It is measured as a percentage value, and an update needs to be made when the value exceeds the deviation threshold.
A deviation reference value is used as the reference value according to which the percentage value will be calculated.

## Endpoint

In the context of the [Airnode protocol](#airnode-protocol), and endpoint represents a distinct type of oracle service provided by an [Airnode](#airnode), which can be parameterized by [Airnode ABI](#airnode-abi)-encoded parameters.

An endpoint is identified by the respective [OIS](https://github.com/api3dao/ois) title and endpoint name.

```solidity
endpointId = keccak256(abi.encode(oisTitle, endpointName));
```

## First-party oracles

An [API provider](#api-provider) that provides oracle services without the use of any middlemen is a first-party oracle.
Compare to [third-party oracles](#third-party-oracles).

## Fulfillment

The [searcher](#searcher) that has won an [OEV auction](#oev-auction) is expected to pay their [bid](#bid) amount.
This payment is referred to as a fulfillment in the context of [OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md).

## Heartbeat

A heartbeat is a [data feed](#data-feed) update that was made to uphold a maximum period of time between two consecutive updates, which is called the heartbeat interval.

## Manager

In the context of [AccessControlRegistry](./contracts/access/accesscontrolregistry.md), a manager is the only account that has the [root role](#root-role) of a tree of roles.

## Manager multisig

On each chain, an [OwnableCallForwarder](./contracts/access/ownablecallforwarder.md) deployment is designated as the [manager](#manager) of the contracts that facilitate API3 [data feed](#data-feed) services.
The owner of each of these OwnableCallForwarder deployments is currently set to be a [GnosisSafeWithoutProxy](./contracts/access/gnosissafewithoutproxy.md) deployment on the respective chain.
Since these GnosisSafeWithoutProxy deployments effectively act as the manager on the respective chain, they are referred to as the manager multisigs.

## MEV

Maximal extractable value (MEV) is a superset of [OEV](#oev) that can be extracted by including, excluding or reordering any interaction.

## OEV

Oracle extractable value (OEV) is a subset of [MEV](#mev) that can be extracted by guaranteeing a specific relative order of oracle updates and related interactions within a transaction.

API3 monetizes its [dAPI](#dapi) services by holding [OEV auctions](#oev-auction) and forwarding the proceeds to the respective [dApps](#dapp).
This is both a net gain for the dApps (which otherwise would have bled these funds to [MEV](#mev) bots and validators), and a fair and scalable business model for API3.

## OEV auction

API3 periodically holds time-limited [OEV](#oev) auctions at [OEV Network](#oev-network) where [searchers](#searcher) [bid](#bid) to receive priority on updating data feeds of a specific [dApp](#dapp) for a period of time.

## OEV feed

Each [data feed](#data-feed) has a [base version](#base-feed) that lives in [Api3ServerV1](./contracts/api3-server-v1/api3serverv1.md), and an [OEV version](#oev-feed) that lives in [Api3ServerV1OevExtension](./contracts/api3-server-v1/api3serverv1oevextension.md).
The OEV feed can be updated by the [searcher](#searcher) that has won the respective [OEV auction](#oev-auction) by using the [signed data](#signed-data) served by the [signed API](#signed-api).

## OEV Network

[OEV](#oev) Network is an Arbitrum Nitro L2.
Its chain ID is 4913 and it uses ETH as the gas token.
[OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md) is deployed on OEV Network, and [searchers](#searcher) bridge ETH to OEV Network to use as [collateral](#collateral).

## Protocol fee

> [!WARNING]  
> This concept is deprecated as API3 will monetize [OEV](#oev) independently from the data feed implementation.
> As such, the protocol fee at [OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md) will be set to zero.

[OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md) specifies that a percentage of the [bid](#bid) amount will be charged as a protocol fee.
While an [auction resolver](#auction-resolver) [awards](#award) a [bid](#bid), the larger of the [collateral](#collateral) amount and protocol fee derived from the respective bid amount gets locked.
Then, the [searcher](#searcher) needs to pay the bid on [Api3ServerV1OevExtension](./contracts/api3-server-v1/api3serverv1oevextension.md) and report their [fulfillment](#fulfillment).
This is followed by an [auction cop](#auction-cop) confirming the fulfillment, which releases locked amount and charges the protocol fee, or contradicting the fulfillment, which releases locked amount and slashes the collateral.

## Proxy

Although the [base feeds](#base-feed) and [OEV feeds](#oev-feed) are readable from [Api3ServerV1](./contracts/api3-server-v1/api3serverv1.md) and [Api3ServerV1OevExtension](./contracts/api3-server-v1/api3serverv1oevextension.md), respectively, [dApps](#dapp) are advised to call the proxy contract that abstracts away the complexity of correctly doing so.

A previous version of the contracts implemented four proxy types ([DataFeed](#data-feed)Proxy, [Dapi](#dapi)Proxy, DataFeedProxyWithOev, DapiProxyWithOev), which were deployed by a ProxyFactory contract.
In the current iteration, this is streamlined down to a single proxy contract ([Api3ReaderProxyV1](./contracts/api3-server-v1/proxies/api3readerproxyv1.md)), which implements the [IApi3ReaderProxy](./contracts/interfaces/iapi3readerproxy.md) interface and the AggregatorV2V3Interface interface of Chainlink.
The dApps are advised to only use Api3ReaderProxyV1 contracts deployed by [Api3ReaderProxyV1Factory](./contracts/api3-server-v1/proxies/api3readerproxyv1factory.md).

## Root role

[AccessControlRegistry](./contracts/access/accesscontrolregistry.md) enables each [manager](#manager) to manage a tree of roles.
Root roles are literally the respective roots of these trees.
Only the respective manager can have a root role, and once initialized, root roles cannot be renounced by the respective managers.

## Searcher

Originating from MEV jargon, a searcher refers to an entity that seeks to make a profit by capturing OEV.
Since searchers need to place [bids](#bid) on [OevAuctionHouse](./contracts/api3-server-v1/oevauctionhouse.md) to receive priority on updating data feeds, they are also referred to as bidders.
Similarly, since they need to update [OEV feeds](#oev-feed) on [Api3ServerV1OevExtension](./contracts/api3-server-v1/api3serverv1oevextension.md), they are also referred to as updaters.

## Signed API

A [signed API](https://github.com/api3dao/signed-api/tree/main/packages/signed-api) receives signed data from [Airnode feeds](#airnode-feed), and serves it to the public through a delivery network with high-availability.
For example, an [Airseeker](#airseeker) may depend on a signed API to update data feeds.

[API providers](#api-provider) should host their own signed APIs (in addition to Airnodes), resulting in a robust and end-to-end first-party oracle service.
Signed APIs that serve data from a variety of Airnodes act as one-stop shops that are both convenient and provide redundancy.
The ideal solution is to use a mix of both types.

## Signed data

All [Airnode protocols](#airnode-protocol) include [Airnodes](#airnode) calling an API and signing the returned data to be ingested by a contract, where the signing scheme differs across protocols.
However, this repo specifically refers to the kind of data signed by [Airnode feeds](#airnode-feed), served by [signed APIs](#signed-api) and used by [Airseekers](#airseeker) to update [data feeds](#data-feed) according to [update parameters](#update-parameters).

The Airseeker protocol uses an [ERC-191](https://eips.ethereum.org/EIPS/eip-191) signature of the [template](#template) ID, off-chain timestamp at the time of the API response and the data returned by the API processed and contract ABI-encoded in a `bytes` type by the respective [Airnode address](#airnode-address).

```solidity
bytes32 ethSignedMessageHash = keccak256(abi.encodePacked(templateId, timestamp, data)).toEthSignedMessageHash();
```

## Sponsor wallet

Sponsor wallets are derived from the [Airnode](#airnode) or [Airseeker](#airseeker) mnemonic in a [protocol](#airnode-protocol)-specific way to provide a specific service.
Then, the party that requires to receive the service funds the respective sponsor wallet, and the wallet uses these funds to send the transactions to deliver the service.
An example of this is the [Nodary](https://nodary.io/feeds) Airseeker serving self-funded [Beacons](#beacon) that update based on specific [update parameters](#update-parameters) depending on which sponsor wallet is funded.

In the context of the Airseeker protocol, the HD wallet path of a specific dAPI is calculated as follows:

1. Take the hash of the [dAPI](#dapi) name
   ```solidity
   hashedDapiName = keccak256(dapiName);
   ```
2. Throw away the last 12 bytes so that we are left with an address-long bytes string (which corresponds to the _sponsor address_ in other Airnode protocols)
3. The path is `m/44'/60'/0'/5/FIRST_31_BITS/SECOND_31_BITS/THIRD_31_BITS/FOURTH_31_BITS/FIFTH_31_BITS/SIXTH_31_BITS`

By announcing the extended public key of `m/44'/60'/0'` of the Airseeker HD wallet, anyone can derive the sponsor wallet address related to a dAPI name.

## Subscription

[dApps](#dapp) can go to [API3 Market](#api3-market) to purchase a 3 month-long subscription plan for any [dAPI](#dapi) they want with specific [update parameters](#update-parameters) on a specific chain.
The purchase of the subscription guarantees the respective [update parameters](#update-parameters) to be upheld regardless of the gas price conditions.

## Template

In the context of the [Airseeker protocol](#airnode-protocol), a template is short for _request template_, and represents an [endpoint](#endpoint) and some [Airnode ABI](#airnode-abi)-encoded parameters.
A template is identified by the respective endpoint ID and Airnode ABI-encoded parameters.

```solidity
templateId = keccak256(abi.encode(endpointID, parameters));
```

## Third-party oracles

A middlemen that calls an API operated by an [API provider](#api-provider) and provides a downstream oracle service.
In other words, an oracle that is not a [first-party oracle](#first-party-oracles).

## Update parameters

Parameters that specify when an [Airseeker](#airseeker) should update a [data feed](#data-feed).
Typically, there are two aspects that require an update:

- [Deviation](#deviation): Defined by the deviation threshold and deviation reference
- [Heartbeat](#heartbeat): Defined by the heartbeat interval
