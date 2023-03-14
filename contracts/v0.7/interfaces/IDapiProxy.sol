// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./IProxy.sol";

interface IDapiProxy is IProxy {
    function dapiNameHash() external view returns (bytes32);
}
