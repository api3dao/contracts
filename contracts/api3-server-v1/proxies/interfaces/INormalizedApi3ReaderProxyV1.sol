// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../interfaces/IApi3ReaderProxy.sol";
import "../../../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";

interface INormalizedApi3ReaderProxyV1 is
    IApi3ReaderProxy,
    AggregatorV2V3Interface
{
    error ZeroProxyAddress();

    error UnsupportedFeedDecimals();

    error FunctionIsNotSupported();

    function feed() external view returns (address feed);
}
