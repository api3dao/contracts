// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../interfaces/IApi3ReaderProxy.sol";
import "../../../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";

interface IProductApi3ReaderProxyV1 is
    IApi3ReaderProxy,
    AggregatorV2V3Interface
{
    error ZeroProxyAddress();

    error SameProxyAddress();

    error ZeroDenominator();

    error FunctionIsNotSupported();

    function proxy1() external view returns (address proxy1);

    function proxy2() external view returns (address proxy2);
}
