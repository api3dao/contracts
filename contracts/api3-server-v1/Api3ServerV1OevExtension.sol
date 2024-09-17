// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../access/AccessControlRegistryAdminnedWithManager.sol";
import "./DataFeedServer.sol";
import "./interfaces/IApi3ServerV1OevExtension.sol";
import "../vendor/@openzeppelin/contracts@4.8.2/utils/Address.sol";
import "../vendor/@openzeppelin/contracts@4.8.2/utils/cryptography/ECDSA.sol";
import "./interfaces/IApi3ServerV1.sol";

/// @title Api3ServerV1 extension for OEV support
/// @notice Api3ServerV1 contract supports base data feeds and OEV
/// functionality. This contract implements the updated OEV design, and thus
/// supersedes the OEV-related portion of Api3ServerV1. As before, the users
/// are intended to read API3 data feeds through a standardized proxy, which
/// abstracts this change away.
contract Api3ServerV1OevExtension is
    AccessControlRegistryAdminnedWithManager,
    DataFeedServer,
    IApi3ServerV1OevExtension
{
    using ECDSA for bytes32;

    struct UpdateAllowance {
        address updater;
        uint32 endTimestamp;
    }

    /// @notice Withdrawer role description
    string public constant override WITHDRAWER_ROLE_DESCRIPTION = "Withdrawer";

    /// @notice Auctioneer role description
    string public constant override AUCTIONEER_ROLE_DESCRIPTION = "Auctioneer";

    /// @notice Withdrawer role
    bytes32 public immutable override withdrawerRole;

    /// @notice Auctioneer role
    bytes32 public immutable override auctioneerRole;

    /// @notice Api3ServerV1 contract address
    address public immutable override api3ServerV1;

    /// @notice Returns the update allowance status for the dApp with ID
    mapping(uint256 => UpdateAllowance) public override dappIdToUpdateAllowance;

    /// @param accessControlRegistry_ AccessControlRegistry contract address
    /// @param adminRoleDescription_ Admin role description
    /// @param manager_ Manager address
    /// @param api3ServerV1_ Api3ServerV1 address
    constructor(
        address accessControlRegistry_,
        string memory adminRoleDescription_,
        address manager_,
        address api3ServerV1_
    )
        AccessControlRegistryAdminnedWithManager(
            accessControlRegistry_,
            adminRoleDescription_,
            manager_
        )
    {
        require(api3ServerV1_ != address(0), "Api3ServerV1 address zero");
        api3ServerV1 = api3ServerV1_;
        withdrawerRole = _deriveRole(
            _deriveAdminRole(manager_),
            WITHDRAWER_ROLE_DESCRIPTION
        );
        auctioneerRole = _deriveRole(
            _deriveAdminRole(manager_),
            AUCTIONEER_ROLE_DESCRIPTION
        );
    }

    /// @notice Called by the contract manager or a withdrawer to withdraw the
    /// accumulated OEV auction proceeds
    /// @param recipient Recipient address
    /// @param amount Amount
    function withdraw(address recipient, uint256 amount) external override {
        require(recipient != address(0), "Recipient address zero");
        require(amount != 0, "Amount zero");
        require(
            msg.sender == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    withdrawerRole,
                    msg.sender
                ),
            "Sender cannot withdraw"
        );
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal reverted");
        emit Withdrew(recipient, amount, msg.sender);
    }

    /// @notice Called by the updater account specified in the details of the
    /// winning bid to pay the bid amount and claim update allowance for the
    /// period that was being auctioned off
    /// @param dappId ID of the dApp for which the bid was placed
    /// @param updateAllowanceEndTimestamp End timestamp of the period for
    /// which update allowance was being auctioned off
    /// @param signature Signature provided by the auctioneer attesting that
    /// the sender has won the auction
    function payOevBid(
        uint256 dappId,
        uint32 updateAllowanceEndTimestamp,
        bytes calldata signature
    ) external payable override {
        require(dappId != 0, "dApp ID zero");
        require(updateAllowanceEndTimestamp != 0, "Timestamp zero");
        // It is intended for the auction periods to be in the order of a
        // minute. To prevent erroneously large update allowance end timestamps
        // from causing an irreversible state change to the contract, we do not
        // allow timestamps that are too far in the future.
        require(
            updateAllowanceEndTimestamp < block.timestamp + 1 hours,
            "Timestamp too far from future"
        );
        address auctioneer = (
            keccak256(
                abi.encodePacked(
                    block.chainid,
                    dappId,
                    msg.sender,
                    msg.value,
                    updateAllowanceEndTimestamp
                )
            ).toEthSignedMessageHash()
        ).recover(signature);
        require(
            IAccessControlRegistry(accessControlRegistry).hasRole(
                auctioneerRole,
                auctioneer
            ),
            "Signature mismatch"
        );
        require(
            dappIdToUpdateAllowance[dappId].endTimestamp <
                updateAllowanceEndTimestamp,
            "Timestamp not more recent"
        );
        dappIdToUpdateAllowance[dappId] = UpdateAllowance({
            updater: msg.sender,
            endTimestamp: updateAllowanceEndTimestamp
        });
        emit PaidOevBid(
            dappId,
            msg.sender,
            msg.value,
            updateAllowanceEndTimestamp,
            auctioneer
        );
    }

    /// @notice Called by the current updater of the dApp with ID to update the
    /// OEV data feed specific to the dApp
    /// @param dappId dApp ID
    /// @param signedData Signed data (see `_updateDappOevDataFeed()` for
    /// details)
    /// @return baseDataFeedId Base data feed ID
    /// @return updatedValue Updated value
    /// @return updatedTimestamp Updated timestamp
    function updateDappOevDataFeed(
        uint256 dappId,
        bytes[] calldata signedData
    )
        external
        override
        returns (
            bytes32 baseDataFeedId,
            int224 updatedValue,
            uint32 updatedTimestamp
        )
    {
        UpdateAllowance storage updateAllowance = dappIdToUpdateAllowance[
            dappId
        ];
        require(msg.sender == updateAllowance.updater, "Sender cannot update");
        (
            baseDataFeedId,
            updatedValue,
            updatedTimestamp
        ) = _updateDappOevDataFeed(
            dappId,
            updateAllowance.endTimestamp,
            signedData
        );
        emit UpdatedDappOevDataFeed(
            dappId,
            msg.sender,
            baseDataFeedId,
            updatedValue,
            updatedTimestamp
        );
    }

    /// @notice Called by the zero address to simulate an OEV data feed update
    /// @dev The intended flow is for a searcher to do a static multicall to
    /// this function and `simulateExternalCall()` to check if the current
    /// signed data lets them extract OEV. If so, the searcher stores this data
    /// and places a bid on OevAuctionHouse. If they win the auction, they pay
    /// the bid and use the stored signed data with `updateDappOevDataFeed()`
    /// to extract OEV.
    /// @param dappId dApp ID
    /// @param signedData Signed data (see `_updateDappOevDataFeed()` for
    /// details)
    /// @return baseDataFeedId Base data feed ID
    /// @return updatedValue Updated value
    /// @return updatedTimestamp Updated timestamp
    function simulateDappOevDataFeedUpdate(
        uint256 dappId,
        bytes[] calldata signedData
    )
        external
        override
        returns (
            bytes32 baseDataFeedId,
            int224 updatedValue,
            uint32 updatedTimestamp
        )
    {
        require(msg.sender == address(0), "Sender address not zero");
        (
            baseDataFeedId,
            updatedValue,
            updatedTimestamp
        ) = _updateDappOevDataFeed(dappId, type(uint256).max, signedData);
    }

    /// @notice Called by the zero address to simulate an external call
    /// @dev The most basic usage of this is in a static multicall that calls
    /// `simulateDappOevDataFeedUpdate()` multiple times to update the relevant
    /// feeds, followed by an external call to the liquidator contract of the
    /// searcher, which is built to return the revenue from the liquidation.
    /// The returned value would then be used to determine the bid amount.
    /// @param target Target address of the external call
    /// @param data Calldata of the external call
    /// @return Returndata of the external call
    function simulateExternalCall(
        address target,
        bytes calldata data
    ) external override returns (bytes memory) {
        require(msg.sender == address(0), "Sender address not zero");
        return Address.functionCall(target, data);
    }

    /// @notice Value of the OEV data feed specific to the dApp, intended for
    /// informational purposes. The dApps are strongly recommended to use the
    /// standardized proxies to read data feeds.
    /// @param dappId dApp ID
    /// @param dataFeedId Data feed ID
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function oevDataFeed(
        uint256 dappId,
        bytes32 dataFeedId
    ) external view override returns (int224 value, uint32 timestamp) {
        DataFeed storage dataFeed = _dataFeeds[
            keccak256(abi.encodePacked(dappId, dataFeedId))
        ];
        (value, timestamp) = (dataFeed.value, dataFeed.timestamp);
    }

    /// @notice Updates OEV data feed specific to the dApp with the signed data
    /// @dev This function replicates the guarantees of base feed updates,
    /// which makes OEV updates exactly as secure as base feed updates. The
    /// main difference between base feed updates and OEV feed updates is that
    /// the signature for OEV updates use the hash of the respective template
    /// ID (while the base feed updates use the template ID as is).
    /// @param dappId dApp ID
    /// @param updateAllowanceEndTimestamp Update allowance end timestamp
    /// @param signedData Signed data that is a bytes array. Each item in the
    /// array is the Airnode address, template ID, data feed timestamp, data
    /// feed value and signature belonging to each Beacon. Similar to base feed
    /// updates, OEV feed updates allow individual Beacon updates to be omitted
    /// (in this case by leaving the signature empty) in case signed data for
    /// some of the Beacons is not available.
    /// @return baseDataFeedId Base data feed ID
    /// @return updatedValue Updated value
    /// @return updatedTimestamp Updated timestamp
    function _updateDappOevDataFeed(
        uint256 dappId,
        uint256 updateAllowanceEndTimestamp,
        bytes[] calldata signedData
    )
        private
        returns (
            bytes32 baseDataFeedId,
            int224 updatedValue,
            uint32 updatedTimestamp
        )
    {
        uint256 beaconCount = signedData.length;
        require(beaconCount > 0, "Signed data empty");
        if (beaconCount == 1) {
            (
                address airnode,
                bytes32 templateId,
                uint256 timestamp,
                bytes memory data,
                bytes memory signature
            ) = abi.decode(
                    signedData[0],
                    (address, bytes32, uint256, bytes, bytes)
                );
            baseDataFeedId = deriveBeaconId(airnode, templateId);
            // Each base feed has an OEV equivalent specific to each dApp. The
            // ID of these OEV feeds are simply the dApp ID and the base data
            // feed ID hashed together, independent from if the base feed is a
            // Beacon or Beacon set.
            bytes32 oevBeaconId = keccak256(
                abi.encodePacked(dappId, baseDataFeedId)
            );
            // The signature cannot be omitted for a single Beacon
            require(
                (
                    keccak256(
                        abi.encodePacked(
                            keccak256(abi.encodePacked(templateId)),
                            timestamp,
                            data
                        )
                    ).toEthSignedMessageHash()
                ).recover(signature) == airnode,
                "Signature mismatch"
            );
            require(
                timestamp < updateAllowanceEndTimestamp,
                "Timestamp not allowed"
            );
            require(
                timestamp > _dataFeeds[oevBeaconId].timestamp,
                "Does not update timestamp"
            );
            updatedValue = decodeFulfillmentData(data);
            updatedTimestamp = uint32(timestamp);
            // We do not need to check if the base feed has a larger timestamp,
            // as the proxy will prefer the base feed if it has a larger
            // timestamp anyway
            _dataFeeds[oevBeaconId] = DataFeed({
                value: updatedValue,
                timestamp: updatedTimestamp
            });
        } else {
            bytes32[] memory baseBeaconIds = new bytes32[](beaconCount);
            bytes32[] memory oevBeaconIds = new bytes32[](beaconCount);
            for (uint256 ind = 0; ind < beaconCount; ind++) {
                (
                    address airnode,
                    bytes32 templateId,
                    uint256 timestamp,
                    bytes memory data,
                    bytes memory signature
                ) = abi.decode(
                        signedData[ind],
                        (address, bytes32, uint256, bytes, bytes)
                    );
                baseBeaconIds[ind] = deriveBeaconId(airnode, templateId);
                // We also store individual Beacons of an OEV feed to make sure
                // that their timestamps are not reduced by OEV updates
                oevBeaconIds[ind] = keccak256(
                    abi.encodePacked(dappId, baseBeaconIds[ind])
                );
                if (signature.length != 0) {
                    require(
                        (
                            keccak256(
                                abi.encodePacked(
                                    keccak256(abi.encodePacked(templateId)),
                                    timestamp,
                                    data
                                )
                            ).toEthSignedMessageHash()
                        ).recover(signature) == airnode,
                        "Signature mismatch"
                    );
                    require(
                        timestamp < updateAllowanceEndTimestamp,
                        "Timestamp not allowed"
                    );
                    require(
                        timestamp > _dataFeeds[oevBeaconIds[ind]].timestamp,
                        "Does not update timestamp"
                    );
                    _dataFeeds[oevBeaconIds[ind]] = DataFeed({
                        value: decodeFulfillmentData(data),
                        timestamp: uint32(timestamp)
                    });
                }
                // Without the following bit, an OEV update would effectively
                // be able to reduce the timestamps of individual Beacons of a
                // Beacon set.
                (
                    int224 baseBeaconValue,
                    uint32 baseBeaconTimestamp
                ) = IApi3ServerV1(api3ServerV1).dataFeeds(baseBeaconIds[ind]);
                if (
                    baseBeaconTimestamp >
                    _dataFeeds[oevBeaconIds[ind]].timestamp
                ) {
                    // Carrying over base feed values to OEV feeds is fine
                    // because they are secured by identical guarantees
                    _dataFeeds[oevBeaconIds[ind]] = DataFeed({
                        value: baseBeaconValue,
                        timestamp: baseBeaconTimestamp
                    });
                }
            }
            baseDataFeedId = deriveBeaconSetId(baseBeaconIds);
            (updatedValue, updatedTimestamp) = aggregateBeacons(oevBeaconIds);
            bytes32 oevBeaconSetId = keccak256(
                abi.encodePacked(dappId, deriveBeaconSetId(baseBeaconIds))
            );
            DataFeed storage oevBeaconSet = _dataFeeds[oevBeaconSetId];
            if (oevBeaconSet.timestamp == updatedTimestamp) {
                require(
                    oevBeaconSet.value != updatedValue,
                    "Does not update Beacon set"
                );
            }
            _dataFeeds[oevBeaconSetId] = DataFeed({
                value: updatedValue,
                timestamp: updatedTimestamp
            });
        }
    }
}
