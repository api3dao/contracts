// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../vendor/@openzeppelin/contracts@4.8.2/security/ReentrancyGuard.sol";
import "../access/AccessControlRegistryAdminnedWithManager.sol";
import "./DataFeedServer.sol";
import "./interfaces/IApi3ServerV1OevExtension.sol";
import "../vendor/@openzeppelin/contracts@4.8.2/utils/Address.sol";
import "../vendor/@openzeppelin/contracts@4.8.2/utils/cryptography/ECDSA.sol";
import "./interfaces/IApi3ServerV1.sol";
import "./interfaces/IApi3ServerV1OevExtensionOevBidPayer.sol";

/// @title Api3ServerV1 extension for OEV support
/// @notice Api3ServerV1 contract supports base data feeds and OEV
/// functionality. This contract implements the updated OEV design, and thus
/// supersedes the OEV-related portion of Api3ServerV1. As before, the users
/// are intended to read API3 data feeds through a standardized proxy, which
/// abstracts this change away.
contract Api3ServerV1OevExtension is
    ReentrancyGuard,
    AccessControlRegistryAdminnedWithManager,
    DataFeedServer,
    IApi3ServerV1OevExtension
{
    using ECDSA for bytes32;

    struct LastPaidBid {
        address updater;
        uint32 signedDataTimestampCutoff;
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

    /// @notice Returns the parameters of the last paid bid for the dApp with
    /// ID
    mapping(uint256 => LastPaidBid) public override dappIdToLastPaidBid;

    bytes32 private constant OEV_BID_PAYMENT_CALLBACK_SUCCESS =
        keccak256("Api3ServerV1OevExtensionOevBidPayer.onOevBidPayment");

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

    /// @dev Used to receive the bid amount in the OEV bid payment callback
    receive() external payable {}

    /// @notice Called by the contract manager or a withdrawer to withdraw the
    /// accumulated OEV auction proceeds
    /// @dev This function has a reentrancy guard to prevent it from being
    /// called in an OEV bid payment callback
    /// @param recipient Recipient address
    /// @param amount Amount
    function withdraw(
        address recipient,
        uint256 amount
    ) external override nonReentrant {
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

    /// @notice An OEV auction bid specifies a dApp ID, a signed data timestamp
    /// cut-off, a bid amount and an updater account. To award the winning bid,
    /// an auctioneer signs a message that includes the hash of these
    /// parameters and publishes it. Then, the updater account calls this
    /// function to pay the bid amount and claim the privilege to execute
    /// updates for the dApp with ID using the signed data whose timestamps are
    /// limited by the cut-off. At least the bid amount must be sent to this
    /// contract with empty calldata in the `onOevBidPayment` callback, which
    /// will be checked upon succesful return.
    /// As a result of the reentrancy guard, nesting OEV bid payments is not
    /// allowed.
    /// @param dappId dApp ID
    /// @param bidAmount Bid amount
    /// @param signedDataTimestampCutoff Signed data timestamp cut-off
    /// @param signature Signature provided by an auctioneer
    /// @param data Data that will be passed through the callback
    function payOevBid(
        uint256 dappId,
        uint256 bidAmount,
        uint32 signedDataTimestampCutoff,
        bytes calldata signature,
        bytes calldata data
    ) external override nonReentrant {
        require(dappId != 0, "dApp ID zero");
        require(signedDataTimestampCutoff != 0, "Cut-off zero");
        // It is intended for the auction periods to be in the order of a
        // minute. To prevent erroneously large cut-off timestamps from causing
        // an irreversible state change to the contract, we do not allow
        // cut-off values that are too far in the future.
        require(
            signedDataTimestampCutoff < block.timestamp + 1 hours,
            "Cut-off too far in the future"
        );
        address auctioneer = (
            keccak256(
                abi.encodePacked(
                    block.chainid,
                    dappId,
                    msg.sender,
                    bidAmount,
                    signedDataTimestampCutoff
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
            dappIdToLastPaidBid[dappId].signedDataTimestampCutoff <
                signedDataTimestampCutoff,
            "Cut-off not more recent"
        );
        dappIdToLastPaidBid[dappId] = LastPaidBid({
            updater: msg.sender,
            signedDataTimestampCutoff: signedDataTimestampCutoff
        });
        uint256 balanceBefore = address(this).balance;
        require(
            IApi3ServerV1OevExtensionOevBidPayer(msg.sender).onOevBidPayment(
                bidAmount,
                data
            ) == OEV_BID_PAYMENT_CALLBACK_SUCCESS,
            "OEV bid payment callback failed"
        );
        require(
            address(this).balance - balanceBefore >= bidAmount,
            "OEV bid payment amount short"
        );
        emit PaidOevBid(
            dappId,
            msg.sender,
            bidAmount,
            signedDataTimestampCutoff,
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
        LastPaidBid storage lastPaidBid = dappIdToLastPaidBid[dappId];
        require(
            msg.sender == lastPaidBid.updater,
            "Sender not last bid updater"
        );
        (
            baseDataFeedId,
            updatedValue,
            updatedTimestamp
        ) = _updateDappOevDataFeed(
            dappId,
            lastPaidBid.signedDataTimestampCutoff,
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
    /// @param signedDataTimestampCutoff Signed data timestamp cut-off
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
        uint256 signedDataTimestampCutoff,
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
                timestamp <= signedDataTimestampCutoff,
                "Timestamp exceeds cut-off"
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
                        timestamp <= signedDataTimestampCutoff,
                        "Timestamp exceeds cut-off"
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
                abi.encodePacked(dappId, baseDataFeedId)
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
