// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../adapters/interfaces/IApi3AggregatorAdapter.sol";

interface IInverseApi3ReaderProxyV1 is IApi3AggregatorAdapter {
    error ZeroProxyAddress();

    error DivisionByZero();

    function proxy() external view returns (address proxy);
}
