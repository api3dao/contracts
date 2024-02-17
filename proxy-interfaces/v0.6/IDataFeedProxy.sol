// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

interface IDataFeedProxy {
    function api3ServerV1() external view returns (address);

    function dataFeedId() external view returns (bytes32);

    function read() external view returns (int224 value, uint32 timestamp);
}
