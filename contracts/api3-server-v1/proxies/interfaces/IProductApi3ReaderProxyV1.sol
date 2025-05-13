// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../adapters/interfaces/IApi3AggregatorAdapter.sol";

interface IProductApi3ReaderProxyV1 is IApi3AggregatorAdapter {
    error ZeroProxyAddress();

    error SameProxyAddress();

    error ZeroDenominator();

    function proxy1() external view returns (address proxy1);

    function proxy2() external view returns (address proxy2);
}
