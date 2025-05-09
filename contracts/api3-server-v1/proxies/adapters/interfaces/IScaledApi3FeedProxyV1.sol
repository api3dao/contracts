// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";

interface IScaledApi3FeedProxyV1 is AggregatorV2V3Interface {
    error ZeroProxyAddress();

    error InvalidDecimals();

    error FunctionIsNotSupported();

    function proxy() external view returns (address proxy);

    function targetDecimals() external view returns (uint8 targetDecimals);
}
