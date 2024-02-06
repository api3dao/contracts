// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../Median.sol";

contract MockMedian is Median {
    function exposedMedian(
        int256[] memory array
    ) external pure returns (int256) {
        return median(array);
    }

    function exposedAverage(int256 x, int256 y) external pure returns (int256) {
        int256[] memory array = new int256[](2);
        if (x < y) {
            array[0] = x;
            array[1] = y;
        } else {
            array[0] = y;
            array[1] = x;
        }
        return median(array);
    }
}
