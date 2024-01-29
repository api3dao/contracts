# Airnode protocol

The term _Airnode protocol_ is used to refer to a range of protocols that are served by [Airnode](../infrastructure/airnode.md).
Some examples are:

- Request-response protocol: Airnode detects generic on-chain requests and responds by fulfillment transactions
- Publish-subscribe protocol: Airnode receives generic on-chain subscriptions and fulfills them whenever their specified conditions are satisfied
- Airseeker protocol: _Airnode feed_ pre-emptively pushes signed data to a signed API, and Airseeker periodically fetches this data from the signed API to update on-chain data feeds whenever the specified conditions are satisfied

## Airnode address

All Airnode protocols involve the API provider signing the data with an EOA wallet.
The address of this wallet is referred to as `airnode` in the contracts and is announced by the respective API provider in their DNS records.

## Sponsor wallets

Sponsor wallets are derived from the [Airnode](../infrastructure/airnode.md) or [Airseeker](../infrastructure/airseeker.md) mnemonic in a protocol-specific way to provide a specific service.
Then, the party that requires to receive the service funds the respective sponsor wallet, and the wallet uses these funds to send the transactions to deliver the service.
An example of this is the Nodary Airseeker serving self-funded [Beacons](../contracts/api3serverv1.md#beacon) that update based on specific update parameters depending on which [sponsor wallet](https://nodary.io/feeds) is funded.
