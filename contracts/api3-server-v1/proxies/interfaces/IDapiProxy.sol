// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IProxy.sol";

interface IDapiProxy is IProxy {
    function dapiNameHash() external view returns (bytes32);
}
