# SelfMulticall

There are two popular multicall contracts out there:

- OpenZeppelin's Multicall is inherited by a contract to enable senders to batch their calls
- MakerDAO's Multicall is a standalone contract that enable callers to batch their reads

SelfMulticall's main purpose is similar to OpenZeppelin's Multicall, in that it is meant to be inherited by a contract to enable batched calls without affecting `msg.sender`.
However, it implements an additional `tryMulticall()` function similar to the `try...()` functions of MakerDAO's Multicall, which does not require all batched calls to succeed.

SelfMulticall also has an extended version, [ExtendedSelfMulticall](./extendedselfmulticall.md), which allows the caller to query some account and block properties.

## Reading

For a batch read operation, one should use `tryMulticall()` to receive a best effort response.
If all calls are guaranteed to succeed, `multicall()` can also be used to the same effect.

## Writing

For a batch send operation, one should

- Make a `tryMulticall()` call with the array of calldata
- Filter out the calldata that fail
- Make an `eth_estimateGas` call for `multicall()` with the filtered array of calldata
- Send the transaction that calls `tryMulticall()` with the filtered array of calldata, using the gas amount returned from the previous step (+10% headroom for the potential difference between `multicall()` and `tryMulticall()`, which is overkill)

The above assumes that some calldata from the array may fail consistently, and some may fail at runtime.
If all calldata are guaranteed to succeed due to how the target contract is implemented, one can send the transaction with `multicall()` directly, without going through any of these steps.
