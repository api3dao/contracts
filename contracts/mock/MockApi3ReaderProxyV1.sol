// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./MockApi3ReaderProxy.sol";
import "../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";

/// @title Mock MockApi3ReaderProxyV1 contract for local tests
/// @notice MockApi3ReaderProxyV1 is an extension on MockApi3ReaderProxy that
/// also implements AggregatorV2V3Interface
contract MockApi3ReaderProxyV1 is MockApi3ReaderProxy, AggregatorV2V3Interface {
    error FunctionIsNotSupported();

    /// @dev Refer to Api3ReaderProxyV1
    function latestAnswer() external view override returns (int256 value) {
        (value, ) = read();
    }

    /// @dev Refer to Api3ReaderProxyV1
    function latestTimestamp()
        external
        view
        override
        returns (uint256 timestamp)
    {
        (, timestamp) = read();
    }

    /// @dev Refer to Api3ReaderProxyV1
    function latestRound() external pure override returns (uint256) {
        revert FunctionIsNotSupported();
    }

    /// @dev Refer to Api3ReaderProxyV1
    function getAnswer(uint256) external pure override returns (int256) {
        revert FunctionIsNotSupported();
    }

    /// @dev Refer to Api3ReaderProxyV1
    function getTimestamp(uint256) external pure override returns (uint256) {
        revert FunctionIsNotSupported();
    }

    /// @dev Refer to Api3ReaderProxyV1
    function decimals() external pure override returns (uint8) {
        return 18;
    }

    /// @dev Refer to Api3ReaderProxyV1
    function description() external pure override returns (string memory) {
        return "";
    }

    /// @dev Refer to Api3ReaderProxyV1
    function version() external pure override returns (uint256) {
        return 4913;
    }

    /// @dev Refer to Api3ReaderProxyV1
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

    /// @dev Refer to Api3ReaderProxyV1
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
