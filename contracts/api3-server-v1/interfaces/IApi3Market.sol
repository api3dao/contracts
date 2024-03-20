// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access/interfaces/IHashRegistry.sol";
import "../../utils/interfaces/IExtendedSelfMulticall.sol";

interface IApi3Market is IHashRegistry, IExtendedSelfMulticall {
    event BoughtSubscription(
        bytes32 indexed dapiName,
        bytes32 indexed subscriptionId,
        bytes32 dataFeedId,
        address sponsorWallet,
        bytes updateParameters,
        uint256 duration,
        uint256 price,
        uint256 paymentAmount
    );

    event CanceledSubscriptions(bytes32 indexed dapiName);

    event UpdatedCurrentSubscriptionId(
        bytes32 indexed dapiName,
        bytes32 indexed subscriptionId
    );

    function buySubscription(
        bytes32 dapiName,
        bytes32 dataFeedId,
        address payable sponsorWallet,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price,
        bytes calldata dapiManagementAndDapiPricingMerkleData
    ) external payable returns (bytes32 subscriptionId);

    function cancelSubscriptions(bytes32 dapiName) external;

    function updateCurrentSubscriptionId(bytes32 dapiName) external;

    function updateDapiName(
        bytes32 dapiName,
        bytes32 dataFeedId,
        address sponsorWallet,
        bytes calldata dapiManagementMerkleData
    ) external;

    function updateSignedApiUrl(
        address airnode,
        string calldata signedApiUrl,
        bytes calldata signedApiUrlMerkleData
    ) external;

    function multicallAndBuySubscription(
        bytes[] calldata multicallData,
        bytes32 dapiName,
        bytes32 dataFeedId,
        address payable sponsorWallet,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price,
        bytes calldata dapiManagementAndDapiPricingMerkleData
    )
        external
        payable
        returns (bytes[] memory returndata, bytes32 subscriptionId);

    function tryMulticallAndBuySubscription(
        bytes[] calldata tryMulticallData,
        bytes32 dapiName,
        bytes32 dataFeedId,
        address payable sponsorWallet,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price,
        bytes calldata dapiManagementAndDapiPricingMerkleData
    )
        external
        payable
        returns (
            bool[] memory successes,
            bytes[] memory returndata,
            bytes32 subscriptionId
        );

    function updateBeaconWithSignedData(
        address airnode,
        bytes32 templateId,
        uint256 timestamp,
        bytes calldata data,
        bytes calldata signature
    ) external returns (bytes32 beaconId);

    function updateBeaconSetWithBeacons(
        bytes32[] calldata beaconIds
    ) external returns (bytes32 beaconSetId);

    function deployDapiProxy(
        bytes32 dapiName,
        bytes calldata metadata
    ) external returns (address proxyAddress);

    function deployDapiProxyWithOev(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external returns (address proxyAddress);

    function registerDataFeed(
        bytes calldata dataFeedDetails
    ) external returns (bytes32 dataFeedId);

    function computeExpectedSponsorWalletBalance(
        bytes32 dapiName
    ) external view returns (uint256 expectedSponsorWalletBalance);

    function computeExpectedSponsorWalletBalanceAfterSubscriptionIsAdded(
        bytes32 dapiName,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price
    ) external view returns (uint256 expectedSponsorWalletBalance);

    function getDapiData(
        bytes32 dapiName
    )
        external
        view
        returns (
            bytes memory dataFeedDetails,
            int224 dapiValue,
            uint32 dapiTimestamp,
            int224[] memory beaconValues,
            uint32[] memory beaconTimestamps,
            bytes[] memory updateParameters,
            uint32[] memory endTimestamps,
            uint224[] memory dailyPrices
        );

    function getDataFeedData(
        bytes32 dataFeedId
    )
        external
        view
        returns (
            bytes memory dataFeedDetails,
            int224 dataFeedValue,
            uint32 dataFeedTimestamp,
            int224[] memory beaconValues,
            uint32[] memory beaconTimestamps
        );

    function subscriptionIdToUpdateParameters(
        bytes32 subscriptionId
    ) external view returns (bytes memory updateParameters);

    function DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE()
        external
        view
        returns (bytes32);

    function DAPI_PRICING_MERKLE_ROOT_HASH_TYPE()
        external
        view
        returns (bytes32);

    function SIGNED_API_URL_MERKLE_ROOT_HASH_TYPE()
        external
        view
        returns (bytes32);

    function MAXIMUM_DAPI_UPDATE_AGE() external view returns (uint256);

    function api3ServerV1() external view returns (address);

    function proxyFactory() external view returns (address);

    function airseekerRegistry() external view returns (address);

    function maximumSubscriptionQueueLength() external view returns (uint256);

    function subscriptions(
        bytes32 subscriptionId
    )
        external
        view
        returns (
            bytes32 updateParametersHash,
            uint32 endTimestamp,
            uint224 dailyPrice,
            bytes32 nextSubscriptionId
        );

    function dapiNameToCurrentSubscriptionId(
        bytes32 dapiName
    ) external view returns (bytes32 currentSubscriptionId);
}
