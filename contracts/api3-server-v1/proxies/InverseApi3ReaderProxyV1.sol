// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./adapters/BaseApi3AggregatorAdapter.sol";
import "./interfaces/IInverseApi3ReaderProxyV1.sol";

/// @title An immutable proxy contract that inverts the value returned by an
/// IApi3ReaderProxy data feed
/// @dev This contract implements the AggregatorV2V3Interface to be compatible
/// with Chainlink aggregators. This allows the contract to be used as a drop-in
/// replacement for Chainlink aggregators in existing dApps.
/// Refer to https://github.com/api3dao/migrate-from-chainlink-to-api3 for more
/// information about the Chainlink interface implementation.
contract InverseApi3ReaderProxyV1 is
    BaseApi3AggregatorAdapter,
    IInverseApi3ReaderProxyV1
{
    /// @notice IApi3ReaderProxy contract address
    address public immutable override proxy;

    /// @param proxy_ IApi3ReaderProxy contract address
    constructor(address proxy_) {
        if (proxy_ == address(0)) {
            revert ZeroProxyAddress();
        }
        proxy = proxy_;
    }

    /// @notice Returns the inverted value of the underlying IApi3ReaderProxy
    /// @dev This inverts the 18-decimal fixed-point value using 1e36 / value.
    /// The operation will revert if `baseValue` is zero (division by zero) or if
    /// `baseValue` is so small (yet non-zero) that the resulting inverted value
    /// would overflow the `int224` type.
    /// @return value Inverted value of the underlying proxy
    /// @return timestamp Timestamp from the underlying proxy
    function read()
        public
        view
        override(BaseApi3AggregatorAdapter, IApi3ReaderProxy)
        returns (int224 value, uint32 timestamp)
    {
        (int224 baseValue, uint32 baseTimestamp) = IApi3ReaderProxy(proxy)
            .read();

        value = int224((1e36) / int256(baseValue));
        timestamp = baseTimestamp;
    }

    /// @dev A unique version is chosen to easily check if an unverified
    /// contract that acts as a Chainlink feed is a InverseApi3ReaderProxyV1
    function version() external pure override returns (uint256) {
        return 4915;
    }
}
