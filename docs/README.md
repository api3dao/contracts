# `@api3/contracts` docs

> For instructions about how to receive API3 services, end users are recommended to refer to the [official docs](https://docs.api3.org/).

The content in this directory is intended to provide insights about API3 contracts that may not be immediately obvious.
For low-level documentation about functionality and usage, refer to the docstrings and the implementation of the respective contract.

## Overview

The API3 stack is designed to achieve two main objectives:

1. Serve [**data feeds**](#data-feeds) powered by first-party oracles
1. Enable any [**Oracle Extractable Value (OEV)**](#oracle-extractable-value-oev) that is created by the usage of these data feeds to be captured

### Data feeds

All oracle solutions involve referring to an API for off-chain data and submitting it to a chain.
The [API3 whitepaper](https://github.com/api3dao/api3-whitepaper/blob/master/api3-whitepaper.pdf) points out that these APIs do not materialize spontaneously in the wild, but rather are built and maintained by businesses as products.
Furthermore, for any serious use-case, there is only a few number of such APIs that are viable.
Then, the optimal architecture for an oracle solution must only depend on the providers of these APIs, and includes no middlemen.

An API provider that provides oracle services is called a **first-party oracle**.
API3 uniquely builds data feeds directly out of first-party oracles.
In contrast, other oracle projects either use third-party oracles, or pass first-party data through layers (e.g., bridges, chains, state channels) that are secured by third parties, which degrades security guarantees down to the level of third-party oracles.

#### API3 Market

One major problem that API3 detected regarding data feeds was that existing oracle projects were failing to keep up with the demand for new integrations.
Frustrated chains and dApps were complaining about having signed contracts, paid for integrations and announced partnerships, only to not have anything happen for months afterwards.

This could not have gone on with the wave of L2s coming, and one response to this was "pull oracles".
Based on the presumption that data feed integrations are inherently impossible to do at scale, a lighter product was invented.
The lightness comes at a cost that we will not elaborate here, but in short, the resulting product ended up not being a viable alternative to traditional data feeds in many use-cases.

API3 took a step back here and asked:
"Are traditional data feeds actually obsolete, or can they be served in a way that meets the demands of the modern Ethereum landscape?"
Our answer to this is [market.api3.org](https://market.api3.org/), a B2B SaaS marketplace that serves data feeds.
Without speaking to a representative or signing a contract, it enables a dApp developer to come in, purchase a subscription to activate a data feed, and start using it in their contract within minutes.
Furthermore, the whole system is designed to streamline the addition of support for new chains and data feed types, resulting in a large and dynamic catalog.

### Oracle Extractable Value (OEV)

The state of a blockchain can only be updated in a discrete manner, with a confirmed block or a sequenced transaction.
Practical limits (such as block size and block time) apply to this process, which implies that these updates will inevitably lag.
Since data feeds are also updated by updating the chain state, all data feed updates lag as well.
Consequently, every data feed is at least slightly out of date at all times.
This fact can often be exploited to extract funds from the users of the data feed in the form of Oracle Extractable Value (OEV).

OEV can also be seen as a subset of Maximal Extractable Value (MEV) that oracles have priority on extracting by batching additional operations with their updates.
Furthermore, instead of searching for such OEV opportunities themselves, oracles can auction off this privilege.
This effectively creates an entirely new revenue stream for dApps.
