// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract MockMulticallTarget {
    error MyError(uint256 fieldAlways123, string fieldAlwaysFoo);

    int256[] private _argumentHistory;

    function alwaysRevertsWithString(
        int256 argPositive,
        int256 argNegative
    ) external pure {
        require(argPositive > 0 && argNegative < 0, "Invalid argument");
        revert("Reverted with string");
    }

    function alwaysRevertsWithCustomError(
        int256 argPositive,
        int256 argNegative
    ) external pure {
        require(argPositive > 0 && argNegative < 0, "Invalid argument");
        revert MyError(123, "Foo");
    }

    function alwaysRevertsWithNoData(
        int256 argPositive,
        int256 argNegative
    ) external pure {
        require(argPositive > 0 && argNegative < 0, "Invalid argument");
        revert(); // solhint-disable-line reason-string
    }

    function convertsPositiveArgumentToNegative(
        int256 argPositive
    ) external payable returns (int256) {
        require(argPositive > 0, "Argument not positive");
        _argumentHistory.push(argPositive);
        return -argPositive;
    }

    function argumentHistory() external view returns (int256[] memory) {
        int256[] memory argumentHistoryInMemory = new int256[](
            _argumentHistory.length
        );
        for (uint256 ind = 0; ind < _argumentHistory.length; ind++) {
            argumentHistoryInMemory[ind] = _argumentHistory[ind];
        }
        return argumentHistoryInMemory;
    }
}
