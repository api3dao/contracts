// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/utils/UUPSUpgradeable.sol";
import "../../vendor/@openzeppelin/contracts@5.0.2/access/Ownable.sol";
import "../../interfaces/IApi3ReaderProxy.sol";
import "../interfaces/IApi3ServerV1.sol";
import "../interfaces/IApi3ServerV1OevExtension.sol";

contract Api3ReaderProxyV1 is UUPSUpgradeable, Ownable, IApi3ReaderProxy {
    address public immutable api3ServerV1;
    address public immutable api3ServerV1OevExtension;
    bytes32 public immutable dapiName;
    uint256 public immutable dappId;
    bytes32 private dapiNameHash;

    constructor(
        address initialOwner,
        address api3ServerV1_,
        address api3ServerV1OevExtension_,
        bytes32 dapiName_,
        uint256 dappId_
    ) Ownable(initialOwner) {
        api3ServerV1 = api3ServerV1_;
        api3ServerV1OevExtension = api3ServerV1OevExtension_;
        dapiName = dapiName_;
        dappId = dappId_;
        dapiNameHash = keccak256(abi.encodePacked(dapiName));
    }

    function read()
        external
        view
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

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyOwner {}
}
