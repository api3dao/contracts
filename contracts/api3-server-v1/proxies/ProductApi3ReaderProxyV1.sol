// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./adapters/BaseApi3AggregatorAdapter.sol";
import "./interfaces/IProductApi3ReaderProxyV1.sol";
import "../../interfaces/IApi3ReaderProxy.sol";

/// @title An immutable proxy contract that is used to read a composition of two
/// IApi3ReaderProxy data feeds by multiplying their values
/// @dev This contract implements the AggregatorV2V3Interface to be compatible
/// with Chainlink aggregators. This allows the contract to be used as a drop-in
/// replacement for Chainlink aggregators in existing dApps.
/// Refer to https://github.com/api3dao/migrate-from-chainlink-to-api3 for more
/// information about the Chainlink interface implementation.
contract ProductApi3ReaderProxyV1 is
    BaseApi3AggregatorAdapter,
    IProductApi3ReaderProxyV1
{
    /// @notice First IApi3ReaderProxy contract address
    address public immutable override proxy1;

    /// @notice Second IApi3ReaderProxy contract address
    address public immutable override proxy2;

    /// @param proxy1_ First IApi3ReaderProxy contract address
    /// @param proxy2_ Second IApi3ReaderProxy contract address
    constructor(address proxy1_, address proxy2_) {
        if (proxy1_ == address(0) || proxy2_ == address(0)) {
            revert ZeroProxyAddress();
        }
        if (proxy1_ == proxy2_) {
            revert SameProxyAddress();
        }
        proxy1 = proxy1_;
        proxy2 = proxy2_;
    }

    /// @notice Returns the current value and timestamp of the rate composition
    /// between two IApi3ReaderProxy proxies by multiplying their values
    /// @dev There is a risk of multiplication overflowing if result is not
    /// suitable for int256 type. The timestamp is the current block timestamp
    /// @return value Value of the product of the two proxies
    /// @return timestamp Timestamp of the current block
    function read()
        public
        view
        override(BaseApi3AggregatorAdapter, IApi3ReaderProxy)
        returns (int224 value, uint32 timestamp)
    {
        (int224 value1, ) = IApi3ReaderProxy(proxy1).read();
        (int224 value2, ) = IApi3ReaderProxy(proxy2).read();

        value = int224((int256(value1) * int256(value2)) / 1e18);
        timestamp = uint32(block.timestamp);
    }

    /// @dev A unique version is chosen to easily check if an unverified
    /// contract that acts as a Chainlink feed is a ProductApi3ReaderProxyV1
    function version() external pure override returns (uint256) {
        return 4914;
    }
}
