// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../api3-server-v1/Api3MarketV2.sol";

contract MockApi3MarketV2 is Api3MarketV2 {
    constructor(
        address owner_,
        address proxyFactory_,
        uint256 maximumSubscriptionQueueLength_
    ) Api3MarketV2(owner_, proxyFactory_, maximumSubscriptionQueueLength_) {}

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
