// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../adapters/interfaces/IApi3AggregatorAdapter.sol";

interface INormalizedApi3ReaderProxyV1 is IApi3AggregatorAdapter {
    error ZeroProxyAddress();

    error UnsupportedFeedDecimals();

    function feed() external view returns (address feed);
}
