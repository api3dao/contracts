// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access/interfaces/IOwnable.sol";
import "../../utils/interfaces/IExtendedSelfMulticall.sol";

interface IAirseekerRegistry is IOwnable, IExtendedSelfMulticall {
    event ActivatedDataFeedId(bytes32 indexed dataFeedId);

    event ActivatedDapiName(bytes32 indexed dapiName);

    event DeactivatedDataFeedId(bytes32 indexed dataFeedId);

    event DeactivatedDapiName(bytes32 indexed dapiName);

    event UpdatedDataFeedIdUpdateParameters(
        bytes32 indexed dataFeedId,
        bytes updateParameters
    );

    event UpdatedDapiNameUpdateParameters(
        bytes32 indexed dapiName,
        bytes updateParameters
    );

    event UpdatedSignedApiUrl(address indexed airnode, string signedApiUrl);

    event RegisteredDataFeed(bytes32 indexed dataFeedId, bytes dataFeedDetails);

    function setDataFeedIdToBeActivated(bytes32 dataFeedId) external;

    function setDapiNameToBeActivated(bytes32 dapiName) external;

    function setDataFeedIdToBeDeactivated(bytes32 dataFeedId) external;

    function setDapiNameToBeDeactivated(bytes32 dapiName) external;

    function setDataFeedIdUpdateParameters(
        bytes32 dataFeedId,
        bytes calldata updateParameters
    ) external;

    function setDapiNameUpdateParameters(
        bytes32 dapiName,
        bytes calldata updateParameters
    ) external;

    function setSignedApiUrl(
        address airnode,
        string calldata signedApiUrl
    ) external;

    function registerDataFeed(
        bytes calldata dataFeedDetails
    ) external returns (bytes32 dataFeedId);

    function activeDataFeed(
        uint256 index
    )
        external
        view
        returns (
            bytes32 dataFeedId,
            bytes32 dapiName,
            bytes memory dataFeedDetails,
            int224 dataFeedValue,
            uint32 dataFeedTimestamp,
            int224[] memory beaconValues,
            uint32[] memory beaconTimestamps,
            bytes memory updateParameters,
            string[] memory signedApiUrls
        );

    function activeDataFeedCount() external view returns (uint256);

    function activeDataFeedIdCount() external view returns (uint256);

    function activeDapiNameCount() external view returns (uint256);

    function dataFeedIdToUpdateParameters(
        bytes32 dataFeedId
    ) external view returns (bytes memory updateParameters);

    function dapiNameToUpdateParameters(
        bytes32 dapiName
    ) external view returns (bytes memory updateParameters);

    function dataFeedIsRegistered(
        bytes32 dataFeedId
    ) external view returns (bool);

    function MAXIMUM_BEACON_COUNT_IN_SET() external view returns (uint256);

    function MAXIMUM_UPDATE_PARAMETERS_LENGTH() external view returns (uint256);

    function MAXIMUM_SIGNED_API_URL_LENGTH() external view returns (uint256);

    function api3ServerV1() external view returns (address);

    function airnodeToSignedApiUrl(
        address airnode
    ) external view returns (string memory signedApiUrl);

    function dataFeedIdToDetails(
        bytes32 dataFeedId
    ) external view returns (bytes memory dataFeedDetails);
}
