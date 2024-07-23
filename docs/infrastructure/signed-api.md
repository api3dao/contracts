# Signed API

A signed API is a service that receives signed data from [Airnode feed](airnode.md) deployments, and serves it to the public through a delivery network with high-availability.
For example, an [Airseeker](./airseeker.md) may depend on a signed API to update data feeds.

API providers should host their own signed APIs, similar to Airnodes, resulting in a robust and end-to-end first-party oracle service.
API3 maintains a [universal signed API implementation](https://github.com/api3dao/signed-api/tree/main/packages/signed-api), yet API providers may choose to use their own implementation.
Signed APIs that serve data from a variety of Airnodes act as one-stop shops that are both convenient and provide redundancy.
The ideal solution is to use a mix of both types.
