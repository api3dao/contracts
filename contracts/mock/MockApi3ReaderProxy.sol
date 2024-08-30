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

    /// @notice Returns the mocked value and timestamp of the API3 data feed
    /// represented by this proxy contract
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function read()
        external
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = (_value, _timestamp);
    }

    /// @notice Mocks the value and timestamp of the API3 data feed represented
    /// by this proxy contract
    /// @param value Data feed value
    /// @param timestamp Data feed timestamp
    function mock(int224 value, uint32 timestamp) external {
        (_value, _timestamp) = (value, timestamp);
    }
}
