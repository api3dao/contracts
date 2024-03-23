// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../api3-server-v1/Api3Market.sol";

contract MockApi3Market is Api3Market {
    constructor(
        address owner_,
        address proxyFactory_,
        uint256 maximumSubscriptionQueueLength_
    ) Api3Market(owner_, proxyFactory_, maximumSubscriptionQueueLength_) {}

    function addSubscriptionToQueue_(
        bytes32 dapiName,
        bytes32 dataFeedId,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price
    ) external {
        addSubscriptionToQueue(
            dapiName,
            dataFeedId,
            updateParameters,
            duration,
            price
        );
    }
}
