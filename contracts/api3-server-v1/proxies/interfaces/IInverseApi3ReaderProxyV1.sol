// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";
import "../../../interfaces/IApi3ReaderProxy.sol";

interface IInverseApi3ReaderProxyV1 is
    AggregatorV2V3Interface,
    IApi3ReaderProxy
{
    error ZeroProxyAddress();

    error FunctionIsNotSupported();

    error DivisionByZero();

    function proxy() external view returns (address proxy);
}
