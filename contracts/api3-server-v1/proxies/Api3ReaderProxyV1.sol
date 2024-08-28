// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/utils/UUPSUpgradeable.sol";
import "../../vendor/@openzeppelin/contracts@5.0.2/access/Ownable.sol";
import {AggregatorV2V3Interface} from "../../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";
import "../../interfaces/IApi3ReaderProxy.sol";
import "../interfaces/IApi3ServerV1.sol";
import "../interfaces/IApi3ServerV1OevExtension.sol";

contract Api3ReaderProxyV1 is
    UUPSUpgradeable,
    Ownable,
    AggregatorV2V3Interface,
    IApi3ReaderProxy
{
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
        public
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

    function latestAnswer() external view override returns (int256 value) {
        (value, ) = read();
    }

    function latestTimestamp()
        external
        view
        override
        returns (uint256 timestamp)
    {
        (, timestamp) = read();
    }

    function latestRound() external pure override returns (uint256) {
        revert("Unsupported function");
    }

    function getAnswer(uint256) external pure override returns (int256) {
        revert("Unsupported function");
    }

    function getTimestamp(uint256) external pure override returns (uint256) {
        revert("Unsupported function");
    }

    function decimals() external pure override returns (uint8) {
        return 18;
    }

    function description() external pure override returns (string memory) {
        return "";
    }

    function version() external pure override returns (uint256) {
        return 4913;
    }

    function getRoundData(
        uint80
    )
        external
        pure
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        revert("Unsupported function");
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = answeredInRound = 0;
        (answer, startedAt) = read();
        updatedAt = startedAt;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyOwner {}
}
