// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IProxyFactory {
    event DeployedDataFeedProxy(
        address indexed proxyAddress,
        bytes32 indexed dataFeedId,
        bytes metadata
    );

    event DeployedDapiProxy(
        address indexed proxyAddress,
        bytes32 indexed dapiName,
        bytes metadata
    );

    event DeployedDataFeedProxyWithOev(
        address indexed proxyAddress,
        bytes32 indexed dataFeedId,
        address oevBeneficiary,
        bytes metadata
    );

    event DeployedDapiProxyWithOev(
        address indexed proxyAddress,
        bytes32 indexed dapiName,
        address oevBeneficiary,
        bytes metadata
    );

    function deployDataFeedProxy(
        bytes32 dataFeedId,
        bytes calldata metadata
    ) external returns (address proxyAddress);

    function deployDapiProxy(
        bytes32 dapiName,
        bytes calldata metadata
    ) external returns (address proxyAddress);

    function deployDataFeedProxyWithOev(
        bytes32 dataFeedId,
        address oevBeneficiary,
        bytes calldata metadata
    ) external returns (address proxyAddress);

    function deployDapiProxyWithOev(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external returns (address proxyAddress);

    function computeDataFeedProxyAddress(
        bytes32 dataFeedId,
        bytes calldata metadata
    ) external view returns (address proxyAddress);

    function computeDapiProxyAddress(
        bytes32 dapiName,
        bytes calldata metadata
    ) external view returns (address proxyAddress);

    function computeDataFeedProxyWithOevAddress(
        bytes32 dataFeedId,
        address oevBeneficiary,
        bytes calldata metadata
    ) external view returns (address proxyAddress);

    function computeDapiProxyWithOevAddress(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external view returns (address proxyAddress);

    function api3ServerV1() external view returns (address);
}
