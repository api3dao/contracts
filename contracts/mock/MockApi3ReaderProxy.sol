// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IApi3ReaderProxy.sol";

contract MockApi3ReaderProxy is IApi3ReaderProxy {
    int224 private _value;

    uint32 private _timestamp;

    function read()
        external
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = (_value, _timestamp);
    }

    function mock(int224 value, uint32 timestamp) external {
        (_value, _timestamp) = (value, timestamp);
    }
}
