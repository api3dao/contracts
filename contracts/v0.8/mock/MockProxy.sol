// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IProxy.sol";

// This contract is provided for testing purposes. It can be extended to mock
// the interface of specific proxy types such as DataFeedProxy and DapiProxy.
contract MockProxy is IProxy {
    address public immutable override dapiServer;

    int224 private _value;

    uint32 private _timestamp;

    constructor(address _dapiServer) {
        dapiServer = _dapiServer;
    }

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
