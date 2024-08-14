// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./interfaces/IDapiProxyWithOevV2.sol";
import "../interfaces/IApi3ServerV1.sol";
import "../interfaces/IApi3ServerV1OevExtension.sol";

// This contract will be upgradeable whose proxy is deployed by a factory
contract DapiProxyWithOevV2 is IDapiProxyWithOevV2 {
    address public override api3ServerV1;

    bytes32 public override dapiNameHash;

    address public override api3ServerV1OevExtension;

    uint256 public override dappId;

    constructor(
        address _api3ServerV1,
        bytes32 _dapiNameHash,
        address _api3ServerV1OevExtension,
        uint256 _dappId
    ) {
        api3ServerV1 = _api3ServerV1;
        dapiNameHash = _dapiNameHash;
        api3ServerV1OevExtension = _api3ServerV1OevExtension;
        dappId = _dappId;
    }

    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        bytes32 dataFeedId = IApi3ServerV1(api3ServerV1)
            .dapiNameHashToDataFeedId(dapiNameHash);
        require(dataFeedId != bytes32(0), "dAPI name not set");
        (int224 baseDapiValue, uint32 baseDapiTimestamp) = IApi3ServerV1(
            api3ServerV1
        ).dataFeeds(dataFeedId);
        (
            int224 oevDapiValue,
            uint32 oevDapiTimestamp
        ) = IApi3ServerV1OevExtension(api3ServerV1OevExtension).oevDataFeed(
                dappId,
                dataFeedId
            );
        if (oevDapiTimestamp > baseDapiTimestamp) {
            (value, timestamp) = (oevDapiValue, oevDapiTimestamp);
        } else {
            (value, timestamp) = (baseDapiValue, baseDapiTimestamp);
        }
        require(timestamp > 0, "Data feed not initialized");
    }
}
