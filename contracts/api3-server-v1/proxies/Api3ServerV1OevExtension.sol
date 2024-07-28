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
        address[] calldata airnodes,
        bytes32[] calldata templateIds,
        uint256[] calldata timestamps,
        bytes[] calldata data,
        bytes[] calldata signatures
    ) external {
        UpdateAllowance storage updateAllowance = dappIdToUpdateAllowance[
            dappId
        ];
        require(msg.sender == updateAllowance.updater, "Sender cannot update");
        require(
            block.timestamp < updateAllowance.endTimestamp,
            "Sender cannot update anymore"
        );
        uint256 beaconCount = airnodes.length;
        require(
            beaconCount == templateIds.length &&
                beaconCount == timestamps.length &&
                beaconCount == data.length &&
                beaconCount == signatures.length,
            "Parameter length mismatch"
        );
        bytes32[] memory beaconIds = new bytes32[](beaconCount);
        for (uint256 ind = 0; ind < beaconCount; ind++) {
            beaconIds[ind] = deriveBeaconId(airnodes[ind], templateIds[ind]);
            // Allow the signature to be omitted in case an API provider is not reporting.
            // See unpackAndValidateOevUpdateSignature() in OevDataFeedServer for a similar thing.
            if (signatures[ind].length != 0) {
                // templateId is hashed before checking the signature!
                require(
                    (
                        keccak256(
                            abi.encodePacked(
                                keccak256(abi.encodePacked(templateIds[ind])),
                                timestamps[ind],
                                data[ind]
                            )
                        ).toEthSignedMessageHash()
                    ).recover(signatures[ind]) == airnodes[ind],
                    "Signature mismatch"
                );
                processBeaconUpdate(beaconIds[ind], timestamps[ind], data[ind]);
            }
            (
                int224 baseBeaconValue,
                uint32 baseBeaconTimestamp
            ) = IApi3ServerV1(api3ServerV1).dataFeeds(beaconIds[ind]);
            if (baseBeaconTimestamp > _dataFeeds[beaconIds[ind]].timestamp) {
                _dataFeeds[beaconIds[ind]] = DataFeed({
                    value: baseBeaconValue,
                    timestamp: baseBeaconTimestamp
                });
            }
        }
        if (beaconCount > 1) {
            updateBeaconSetWithBeacons(beaconIds);
        }
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
