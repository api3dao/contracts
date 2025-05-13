// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../../../../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";
import "../../../../interfaces/IApi3ReaderProxy.sol";

interface IApi3AggregatorAdapter is IApi3ReaderProxy, AggregatorV2V3Interface {
    error FunctionIsNotSupported();
}
