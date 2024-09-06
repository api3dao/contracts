// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IApi3ReaderProxyV1Factory {
    event DeployedApi3ReaderProxyV1(
        address indexed proxy,
        bytes32 dapiName,
        uint256 dappId,
        bytes metadata
    );

    function deployApi3ReaderProxyV1(
        bytes32 dapiName,
        uint256 dappId,
        bytes calldata metadata
    ) external returns (address proxy);

    function computeApi3ReaderProxyV1Address(
        bytes32 dapiName,
        uint256 dappId,
        bytes calldata metadata
    ) external view returns (address proxy);

    function api3ServerV1OevExtension() external returns (address);
}
