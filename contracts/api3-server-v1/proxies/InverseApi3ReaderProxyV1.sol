// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./interfaces/IInverseApi3ReaderProxyV1.sol";

/// @title An immutable proxy contract that inverts the value returned by an
/// IApi3ReaderProxy data feed
/// @dev This contract implements the AggregatorV2V3Interface to be compatible
/// with Chainlink aggregators. This allows the contract to be used as a drop-in
/// replacement for Chainlink aggregators in existing dApps.
/// Refer to https://github.com/api3dao/migrate-from-chainlink-to-api3 for more
/// information about the Chainlink interface implementation.
contract InverseApi3ReaderProxyV1 is IInverseApi3ReaderProxyV1 {
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
    /// It is assumed that operation might overflow if `baseValue` is too small
    /// and will revert on division by zero. No safety checks are performed to
    /// optimize gas usage. Use with trusted feeds only.
    /// @return value Inverted value of the underlying proxy
    /// @return timestamp Timestamp from the underlying proxy
    function read()
        public
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        (int224 baseValue, uint32 baseTimestamp) = IApi3ReaderProxy(proxy)
            .read();

        unchecked {
            value = int224((1e36) / int256(baseValue));
        }
        timestamp = baseTimestamp;
    }

    /// @dev AggregatorV2V3Interface users are already responsible with
    /// validating the values that they receive (e.g., revert if the spot price
    /// of an asset is negative). Therefore, this contract omits validation.
    function latestAnswer() external view override returns (int256 value) {
        (value, ) = read();
    }

    /// @dev A Chainlink feed contract returns the block timestamp at which the
    /// feed was last updated. On the other hand, an API3 feed timestamp
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

    /// @dev API3 feeds are updated asynchronously and not in rounds
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

    /// @dev API3 feeds always use 18 decimals
    function decimals() external pure override returns (uint8) {
        return 18;
    }

    /// @dev The underlying proxy dAPI name(s) act as the description, and this
    /// is left empty to save gas on contract deployment
    function description() external pure override returns (string memory) {
        return "";
    }

    /// @dev A unique version is chosen to easily check if an unverified
    /// contract that acts as a Chainlink feed is a InverseApi3ReaderProxyV1
    function version() external pure override returns (uint256) {
        return 4915;
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
