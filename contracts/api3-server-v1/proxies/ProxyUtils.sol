// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title Proxy Utilities Library
/// @notice Provides utility functions for proxy contracts
library ProxyUtils {
    /// @notice Scales an integer value between decimal representations
    /// @param value The value to scale
    /// @param fromDecimals The number of decimals in the original value
    /// @param toDecimals The target number of decimals
    /// @return The scaled integer value
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
