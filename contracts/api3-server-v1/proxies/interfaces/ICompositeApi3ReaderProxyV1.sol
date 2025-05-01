// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";
import "../../../interfaces/IApi3ReaderProxy.sol";

interface ICompositeApi3ReaderProxyV1 is
    AggregatorV2V3Interface,
    IApi3ReaderProxy
{
    error ZeroProxyAddress();

    error SameProxyAddress();

    error InvalidDecimals();

    error FunctionIsNotSupported();

    error ZeroDenominator();

    function proxy1() external returns (address proxy1);

    function proxy2() external returns (address proxy2);
}
