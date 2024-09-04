// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IApi3ReaderProxyV1Factory {
    event DeployedApi3ReaderProxyV1(
        address indexed proxy,
        bytes32 dapiName,
        uint256 dappId
    );

    function deployApi3ReaderProxyV1(
        bytes32 dapiName,
        uint256 dappId
    ) external returns (address proxy);

    function computeApi3ReaderProxyV1Address(
        bytes32 dapiName,
        uint256 dappId
    ) external view returns (address proxy);

    function api3ServerV1OevExtension() external returns (address);
}
