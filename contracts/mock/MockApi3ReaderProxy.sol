// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IApi3ReaderProxy.sol";

/// @title Mock Api3ReaderProxy contract for local tests
/// @notice MockApi3ReaderProxy acts as an Api3ReaderProxy and allows anyone to
/// mock the data feed value and timestamp it returns. Since it implements no
/// access control, it is only recommended to be used for local tests.
contract MockApi3ReaderProxy is IApi3ReaderProxy {
    int224 private _value;
    uint32 private _timestamp;

    /// @notice Mocks the value and timestamp of the API3 data feed represented
    /// by this proxy contract
    /// @param value Data feed value
    /// @param timestamp Data feed timestamp
    function mock(int224 value, uint32 timestamp) external {
        require(timestamp != 0, "Timestamp zero");
        (_value, _timestamp) = (value, timestamp);
    }

    /// @notice Returns the mocked value and timestamp of the API3 data feed
    /// represented by this proxy contract
    /// @dev The real `read()` may revert due to underlying conditions (the
    /// respective dAPI name is not set, the respective data feed has not been
    /// initalized, etc.) This `read()` implementation reverts if `mock()` has
    /// not been called beforehand to simulate such conditions.
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function read()
        public
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = (_value, _timestamp);
        require(timestamp != 0, "Data feed not mocked");
    }
}
