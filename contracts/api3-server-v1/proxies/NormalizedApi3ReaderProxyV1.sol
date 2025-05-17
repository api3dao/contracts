// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

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
contract NormalizedApi3ReaderProxyV1 is INormalizedApi3ReaderProxyV1 {
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
        override
        returns (int224 value, uint32 timestamp)
    {
        (, int256 answer, , uint256 updatedAt, ) = AggregatorV2V3Interface(feed)
            .latestRoundData();

        value = int224(answer.scaleValue(feedDecimals, 18));
        timestamp = uint32(updatedAt);
    }

    /// @dev AggregatorV2V3Interface users are already responsible with
    /// validating the values that they receive (e.g., revert if the spot price
    /// of an asset is negative). Therefore, this contract omits validation.
    function latestAnswer() external view override returns (int256 value) {
        (value, ) = read();
    }

    /// @dev A Chainlink feed contract returns the block timestamp at which the
    /// feed was last updated. On the other hand, an Api3 feed timestamp
    /// denotes the point in time at which the first-party oracles signed the
    /// data used to do the last update. We find this to be a reasonable
    /// approximation, considering that usually the timestamp is only used to
    /// check if the last update is stale.
    function latestTimestamp()
        external
        view
        override
        returns (uint256 timestamp)
    {
        (, timestamp) = read();
    }

    /// @dev Api3 feeds are updated asynchronously and not in rounds
    function latestRound() external pure override returns (uint256) {
        revert FunctionIsNotSupported();
    }

    /// @dev Functions that use the round ID as an argument are not supported
    function getAnswer(uint256) external pure override returns (int256) {
        revert FunctionIsNotSupported();
    }

    /// @dev Functions that use the round ID as an argument are not supported
    function getTimestamp(uint256) external pure override returns (uint256) {
        revert FunctionIsNotSupported();
    }

    /// @dev Api3 feeds always use 18 decimals
    function decimals() external pure override returns (uint8) {
        return 18;
    }

    /// @dev Description can be read from the underlying feed description, and
    /// this is left empty to save gas on contract deployment
    function description() external pure override returns (string memory) {
        return "";
    }

    /// @dev A unique version is chosen to easily check if an unverified
    /// contract that acts as a Chainlink feed is a NormalizedApi3ReaderProxyV1
    function version() external pure override returns (uint256) {
        return 4916;
    }

    /// @dev Functions that use the round ID as an argument are not supported
    function getRoundData(
        uint80
    )
        external
        pure
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        revert FunctionIsNotSupported();
    }

    /// @dev Rounds IDs are returned as `0` as invalid values.
    /// Similar to `latestAnswer()`, we leave the validation of the returned
    /// value to the caller.
    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = answeredInRound = 0;
        (answer, startedAt) = read();
        updatedAt = startedAt;
    }
}
