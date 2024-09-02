// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IApi3ReaderProxyFactoryV1 {
    function deployDapiProxyUpgradeable(
        bytes32 dapiName,
        uint256 dappId
    ) external returns (address proxy);

    function api3ServerV1() external returns (address);

    function api3ServerV1OevExtension() external returns (address);
}
