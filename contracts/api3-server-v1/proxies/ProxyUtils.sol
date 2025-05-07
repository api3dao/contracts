// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

library ProxyUtils {
    function scaleValue(
        int256 value,
        uint8 fromDecimals,
        uint8 toDecimals
    ) internal pure returns (int256) {
        if (fromDecimals == toDecimals) return value;
        uint8 delta = fromDecimals > toDecimals
            ? fromDecimals - toDecimals
            : toDecimals - fromDecimals;

        int256 factor = int256(10 ** uint256(delta));
        return fromDecimals < toDecimals ? value * factor : value / factor;
    }
}
