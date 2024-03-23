// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IProxy.sol";

// This contract is provided for testing purposes. It can be extended to mock
// the interface of specific proxy types such as DataFeedProxy and DapiProxy.
contract MockProxy is IProxy {
    address public immutable override api3ServerV1;

    int224 private _value;

    uint32 private _timestamp;

    constructor(address _api3ServerV1) {
        api3ServerV1 = _api3ServerV1;
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
