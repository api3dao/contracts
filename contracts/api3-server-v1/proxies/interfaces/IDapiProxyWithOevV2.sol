// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IDapiProxy.sol";

interface IDapiProxyWithOevV2 is IDapiProxy {
    function api3ServerV1OevExtension() external view returns (address);

    function dappId() external view returns (uint256);
}
