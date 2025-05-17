// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./adapters/BaseApi3AggregatorAdapter.sol";
import "./interfaces/INormalizedApi3ReaderProxyV1.sol";
import "./ProxyUtils.sol";

/// @title An immutable proxy contract that converts a Chainlink
/// AggregatorV2V3Interface feed output to 18 decimals to conform with
/// IApi3ReaderProxy decimal standard
/// @dev This contract implements the AggregatorV2V3Interface to be compatible
/// with Chainlink aggregators. This allows the contract to be used as a drop-in
/// replacement for Chainlink aggregators in existing dApps.
/// Refer to https://github.com/api3dao/migrate-from-chainlink-to-api3 for more
/// information about the Chainlink interface implementation.
contract NormalizedApi3ReaderProxyV1 is
    BaseApi3AggregatorAdapter,
    INormalizedApi3ReaderProxyV1
{
    using ProxyUtils for int256;

    /// @notice Chainlink AggregatorV2V3Interface contract address
    address public immutable override feed;

    uint8 internal immutable feedDecimals;

    /// @param feed_ The address of the Chainlink AggregatorV2V3Interface feed
    constructor(address feed_) {
        if (feed_ == address(0)) {
            revert ZeroProxyAddress();
        }

        uint8 feedDecimals_ = AggregatorV2V3Interface(feed_).decimals();
        if (feedDecimals_ == 0 || feedDecimals_ > 36) {
            revert UnsupportedFeedDecimals();
        }
        feed = feed_;
        feedDecimals = feedDecimals_;
    }

    /// @notice Returns the price of the underlying Chainlink feed normalized to
    /// 18 decimals
    /// of underlying Chainlink feed
    /// @return value The normalized signed fixed-point value with 18 decimals
    /// @return timestamp The updatedAt timestamp of the feed
    function read()
        public
        view
        override(BaseApi3AggregatorAdapter, IApi3ReaderProxy)
        returns (int224 value, uint32 timestamp)
    {
        (, int256 answer, , uint256 updatedAt, ) = AggregatorV2V3Interface(feed)
            .latestRoundData();

        value = int224(answer.scaleValue(feedDecimals, 18));
        timestamp = uint32(updatedAt);
    }

    /// @dev A unique version is chosen to easily check if an unverified
    /// contract that acts as a Chainlink feed is a NormalizedApi3ReaderProxyV1
    function version() external pure override returns (uint256) {
        return 4916;
    }
}
