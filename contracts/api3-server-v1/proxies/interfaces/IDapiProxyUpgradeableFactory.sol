// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IDapiProxyUpgradeableFactory {
    event DeployedDapiProxyUpgradeable(
        address indexed proxy,
        bytes initializationData,
        bytes metadata
    );

    function deployDapiProxyUpgradeable(
        bytes calldata initializationData,
        bytes calldata metadata
    ) external returns (address proxy);
}
