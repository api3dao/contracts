// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../Median.sol";

contract MockSort is Sort {
    function exposedSort(
        int256[] memory array
    ) external pure returns (int256[] memory) {
        sort(array);
        return array;
    }
}
