// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access/interfaces/IAccessControlRegistryAdminnedWithManager.sol";
import "../interfaces/IDataFeedServer.sol";

interface IApi3ServerV1OevExtension is
    IAccessControlRegistryAdminnedWithManager,
    IDataFeedServer
{
    event Withdrew(address recipient, uint256 amount, address sender);

    event PaidOevBid(
        uint256 indexed dappId,
        address indexed updater,
        uint256 bidAmount,
        uint256 signedDataTimestampCutoff,
        address auctioneer
    );

    event UpdatedDappOevDataFeed(
        uint256 indexed dappId,
        address indexed updater,
        bytes32 dataFeedId,
        int224 updatedValue,
        uint32 updatedTimestamp
    );

    function withdraw(address recipient, uint256 amount) external;

    function payOevBid(
        uint256 dappId,
        uint256 bidAmount,
        uint32 signedDataTimestampCutoff,
        bytes calldata signature,
        bytes calldata data
    ) external;

    function updateDappOevDataFeed(
        uint256 dappId,
        bytes[] calldata signedData
    )
        external
        returns (
            bytes32 baseDataFeedId,
            int224 updatedValue,
            uint32 updatedTimestamp
        );

    function simulateDappOevDataFeedUpdate(
        uint256 dappId,
        bytes[] calldata signedData
    )
        external
        returns (
            bytes32 baseDataFeedId,
            int224 updatedValue,
            uint32 updatedTimestamp
        );

    function simulateExternalCall(
        address target,
        bytes calldata data
    ) external returns (bytes memory);

    function oevDataFeed(
        uint256 dappId,
        bytes32 dataFeedId
    ) external view returns (int224 value, uint32 timestamp);

    // solhint-disable-next-line func-name-mixedcase
    function WITHDRAWER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    // solhint-disable-next-line func-name-mixedcase
    function AUCTIONEER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    function withdrawerRole() external view returns (bytes32);

    function auctioneerRole() external view returns (bytes32);

    function api3ServerV1() external view returns (address);

    function dappIdToLastPaidBid(
        uint256 dappId
    ) external view returns (address updater, uint32 endTimestamp);
}
