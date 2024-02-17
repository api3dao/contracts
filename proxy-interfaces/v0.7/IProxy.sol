// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

interface IProxy {
    function api3ServerV1() external view returns (address);

    function read() external view returns (int224 value, uint32 timestamp);
}
