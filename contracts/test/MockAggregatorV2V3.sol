// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";

contract MockAggregatorV2V3 is AggregatorV2V3Interface {
    uint8 private _decimals;
    int256 private _answer;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 answer, uint256 updatedAt) {
        _decimals = decimals_;
        _answer = answer;
        _updatedAt = updatedAt;
    }

    function latestAnswer() external view override returns (int256) {
        return _answer;
    }

    function latestTimestamp() external view override returns (uint256) {
        return _updatedAt;
    }

    function latestRound() external pure override returns (uint256) {
        revert("Not implemented");
    }

    function getAnswer(uint256) external pure override returns (int256) {
        revert("Not implemented");
    }

    function getTimestamp(uint256) external pure override returns (uint256) {
        revert("Not implemented");
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external pure override returns (string memory) {
        return "MockAggregatorV2V3";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(
        uint80
    )
        external
        pure
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        revert("Not implemented");
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80)
    {
        return (0, _answer, _updatedAt, _updatedAt, 0);
    }

    function setDecimals(uint8 decimals_) external {
        _decimals = decimals_;
    }

    function setAnswer(int256 answer) external {
        _answer = answer;
    }

    function setUpdatedAt(uint256 updatedAt) external {
        _updatedAt = updatedAt;
    }
}
