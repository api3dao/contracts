// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDapiProxy.sol";
import "../interfaces/IApi3ServerV1.sol";
import "./Api3ServerV1OevExtension.sol";

// This contract will be upgradeable whose proxy is deployed by a factory
contract DapiProxyWithOevV2 is IDapiProxy {
    address public override api3ServerV1;

    bytes32 public override dapiNameHash;

    address public api3ServerV1OevExtension;

    uint256 public dappId;

    constructor(
        address api3ServerV1_,
        bytes32 dapiNameHash_,
        address api3ServerV1OevExtension_,
        uint256 dappId_
    ) {
        api3ServerV1 = api3ServerV1_;
        dapiNameHash = dapiNameHash_;
        api3ServerV1OevExtension = api3ServerV1OevExtension_;
        dappId = dappId_;
    }

    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        // Adapted from _readDataFeedWithDapiNameHashAsOevProxy() of OevDapiServer
        bytes32 dataFeedId = IApi3ServerV1(api3ServerV1)
            .dapiNameHashToDataFeedId(dapiNameHash);
        require(dataFeedId != bytes32(0), "dAPI name not set");
        (int224 baseDapiValue, uint32 baseDapiTimestamp) = IApi3ServerV1(
            api3ServerV1
        ).dataFeeds(dataFeedId);
        (
            int224 oevDapiValue,
            uint32 oevDapiTimestamp
        ) = Api3ServerV1OevExtension(api3ServerV1OevExtension).dataFeeds(
                keccak256(abi.encodePacked(dappId, dataFeedId))
            );
        if (oevDapiTimestamp > baseDapiTimestamp) {
            (value, timestamp) = (oevDapiValue, oevDapiTimestamp);
        } else {
            (value, timestamp) = (baseDapiValue, baseDapiTimestamp);
        }
        require(timestamp > 0, "Data feed not initialized");
    }
}
