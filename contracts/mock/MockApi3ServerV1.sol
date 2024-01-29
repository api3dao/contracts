// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@api3/airnode-protocol-v1/contracts/api3-server-v1/Api3ServerV1.sol";

contract MockApi3ServerV1 is Api3ServerV1 {
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager
    ) Api3ServerV1(_accessControlRegistry, _adminRoleDescription, _manager) {}

    function mockUpdate(
        bytes32 dataFeedId,
        int224 value,
        uint32 timestamp
    ) external {
        _dataFeeds[dataFeedId] = DataFeed({value: value, timestamp: timestamp});
    }
}
