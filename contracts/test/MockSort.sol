// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../api3-server-v1/aggregation/Median.sol";

contract MockSort is Sort {
    function exposedSort(
        int256[] memory array
    ) external pure returns (int256[] memory) {
        sort(array);
        return array;
    }
}
