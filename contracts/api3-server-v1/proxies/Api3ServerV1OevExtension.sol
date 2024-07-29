// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access/AccessControlRegistryAdminnedWithManager.sol";
import "../DataFeedServer.sol";
import "../../vendor/@openzeppelin/contracts@4.8.2/utils/cryptography/ECDSA.sol";
import "../interfaces/IApi3ServerV1.sol";

contract Api3ServerV1OevExtension is
    AccessControlRegistryAdminnedWithManager,
    DataFeedServer
{
    using ECDSA for bytes32;

    struct UpdateAllowance {
        address updater;
        uint32 endTimestamp;
    }

    string public constant AUCTIONEER_ROLE_DESCRIPTION = "Auctioneer";

    bytes32 public immutable auctioneerRole;

    address public immutable api3ServerV1;

    mapping(uint256 => UpdateAllowance) public dappIdToUpdateAllowance;

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
        auctioneerRole = _deriveRole(
            _deriveAdminRole(manager),
            AUCTIONEER_ROLE_DESCRIPTION
        );
    }

    // If an auctioneer accidentally provides a signature that is too far in the future,
    // revoke its auctioneer role and then reset update allowances for the affected dApps.
    function resetUpdateAllowance(uint256 dappId) external {
        require(msg.sender == manager, "Sender not manager");
        delete dappIdToUpdateAllowance[dappId];
    }

    // The updater whose address is specified by the bidder calls this function with the exact bid amount.
    // Doing so allows the updater to use the signed data until the end timestamp.
    function payOevBid(
        address auctioneer,
        uint256 dappId,
        uint32 updateAllowanceEndTimestamp,
        bytes calldata signature
    ) external payable {
        require(
            IAccessControlRegistry(accessControlRegistry).hasRole(
                auctioneerRole,
                auctioneer
            ),
            "Auctioneer invalid"
        );
        require(
            (
                keccak256(
                    abi.encodePacked(
                        block.chainid,
                        dappId,
                        msg.sender,
                        msg.value,
                        updateAllowanceEndTimestamp
                    )
                ).toEthSignedMessageHash()
            ).recover(signature) == auctioneer,
            "Signature mismatch"
        );
        UpdateAllowance storage updateAllowance = dappIdToUpdateAllowance[
            dappId
        ];
        require(
            updateAllowance.endTimestamp < updateAllowanceEndTimestamp,
            "End timestamp stale"
        );
        dappIdToUpdateAllowance[dappId] = UpdateAllowance({
            updater: msg.sender,
            endTimestamp: updateAllowanceEndTimestamp
        });
        // Emit event
        // The auction cop needs to check this event for confirmation/contradiction.
        // We may introduce a bid ID (which means we wouldn't need a typehash).
    }

    function withdraw(address recipient, uint256 amount) external {
        // Add a role
        require(msg.sender == manager, "Sender not manager");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal reverted");
        // Emit event
    }

    // templateIds are the actual ones used by the dAPI (and not the once-hashed OEV ones)
    function updateDappOevDataFeedWithSignedData(
        uint256 dappId,
        bytes[] calldata signedData
    ) external {
        UpdateAllowance storage updateAllowance = dappIdToUpdateAllowance[
            dappId
        ];
        require(msg.sender == updateAllowance.updater, "Sender cannot update");
        require(
            block.timestamp < updateAllowance.endTimestamp,
            "Sender cannot update anymore"
        );
        uint256 beaconCount = signedData.length;
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
            bytes32 baseBeaconId = deriveBeaconId(airnode, templateId);
            bytes32 oevBeaconId = keccak256(
                abi.encodePacked(dappId, baseBeaconId)
            );
            baseBeaconIds[ind] = baseBeaconId;
            oevBeaconIds[ind] = oevBeaconId;
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
                // Cannot use processBeaconUpdate() here because data is not calldata
                require(
                    timestamp < block.timestamp + 1 hours,
                    "Timestamp not valid"
                );
                require(
                    timestamp > _dataFeeds[oevBeaconId].timestamp,
                    "Does not update timestamp"
                );
                _dataFeeds[oevBeaconId] = DataFeed({
                    value: decodeFulfillmentData(data),
                    timestamp: uint32(timestamp)
                });
            }
            (
                int224 baseBeaconValue,
                uint32 baseBeaconTimestamp
            ) = IApi3ServerV1(api3ServerV1).dataFeeds(baseBeaconId);
            if (baseBeaconTimestamp > _dataFeeds[oevBeaconId].timestamp) {
                _dataFeeds[oevBeaconId] = DataFeed({
                    value: baseBeaconValue,
                    timestamp: baseBeaconTimestamp
                });
            }
        }
        if (beaconCount > 1) {
            (int224 updatedValue, uint32 updatedTimestamp) = aggregateBeacons(
                oevBeaconIds
            );
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
        // Emit event
    }

    function mockUpdateAllowance(
        uint256 dappId,
        address updater,
        uint32 updateAllowanceEndTimestamp
    ) external {
        require(msg.sender == address(0), "Sender address not zero");
        require(tx.gasprice == 0, "Tx gas price not zero");
        dappIdToUpdateAllowance[dappId] = UpdateAllowance({
            updater: updater,
            endTimestamp: updateAllowanceEndTimestamp
        });
    }

    function dataFeeds(
        bytes32 dataFeedId
    ) external view returns (int224 value, uint32 timestamp) {
        DataFeed storage dataFeed = _dataFeeds[dataFeedId];
        (value, timestamp) = (dataFeed.value, dataFeed.timestamp);
    }
}
