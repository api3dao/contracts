// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/beacon/UpgradeableBeacon.sol";
import "./interfaces/IDapiProxyUpgradeableFactory.sol";
import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/beacon/BeaconProxy.sol";

contract DapiProxyUpgradeableFactory is
    UpgradeableBeacon,
    IDapiProxyUpgradeableFactory
{
    constructor(
        address implementation_,
        address initialOwner
    ) UpgradeableBeacon(implementation_, initialOwner) {}

    function deployDapiProxyUpgradeable(
        bytes calldata initializationData,
        bytes calldata metadata
    ) external override returns (address proxy) {
        proxy = address(
            new BeaconProxy{salt: keccak256(metadata)}(
                address(this),
                initializationData
            )
        );
        emit DeployedDapiProxyUpgradeable(proxy, initializationData, metadata);
    }
}
