// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../access/AccessControlRegistryAdminnedWithManager.sol";
import "./DataFeedServer.sol";
import "./interfaces/IApi3ServerV1OevExtension.sol";
import "../vendor/@openzeppelin/contracts@4.8.2/utils/Address.sol";
import "../vendor/@openzeppelin/contracts@4.8.2/utils/cryptography/ECDSA.sol";
import "./interfaces/IApi3ServerV1.sol";

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

    string public constant override AUCTIONEER_ROLE_DESCRIPTION = "Auctioneer";

    string public constant override WITHDRAWER_ROLE_DESCRIPTION = "Withdrawer";

    bytes32 public immutable override auctioneerRole;

    bytes32 public immutable override withdrawerRole;

    address public immutable override api3ServerV1;

    mapping(uint256 => UpdateAllowance) public override dappIdToUpdateAllowance;

    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager,
        address _api3ServerV1
    )
        AccessControlRegistryAdminnedWithManager(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager
        )
    {
        require(_api3ServerV1 != address(0), "Api3ServerV1 address zero");
        api3ServerV1 = _api3ServerV1;
        auctioneerRole = _deriveRole(
            _deriveAdminRole(_manager),
            AUCTIONEER_ROLE_DESCRIPTION
        );
        withdrawerRole = _deriveRole(
            _deriveAdminRole(_manager),
            WITHDRAWER_ROLE_DESCRIPTION
        );
    }

    function withdraw(address recipient, uint256 amount) external override {
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

    // The updater whose address is specified by the bidder calls this function with the exact bid amount.
    // Doing so allows the updater to use the signed data until the end timestamp.
    function payOevBid(
        uint256 dappId,
        uint32 updateAllowanceEndTimestamp,
        bytes calldata signature
    ) external payable override {
        require(
            updateAllowanceEndTimestamp > block.timestamp,
            "Timestamp stale"
        );
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

    // templateIds are the actual ones used by the dAPI (and not the once-hashed OEV ones)
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
        require(
            block.timestamp < updateAllowance.endTimestamp,
            "Sender cannot update anymore"
        );
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

    function simulateExternalCall(
        address target,
        bytes calldata data
    ) external override returns (bytes memory) {
        require(msg.sender == address(0), "Sender address not zero");
        return Address.functionCall(target, data);
    }

    function oevDataFeed(
        uint256 dappId,
        bytes32 dataFeedId
    ) external view override returns (int224 value, uint32 timestamp) {
        DataFeed storage dataFeed = _dataFeeds[
            keccak256(abi.encodePacked(dappId, dataFeedId))
        ];
        (value, timestamp) = (dataFeed.value, dataFeed.timestamp);
    }

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
            bytes32 oevBeaconId = keccak256(
                abi.encodePacked(dappId, baseDataFeedId)
            );
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
            (
                int224 baseBeaconValue,
                uint32 baseBeaconTimestamp
            ) = IApi3ServerV1(api3ServerV1).dataFeeds(baseDataFeedId);
            if (baseBeaconTimestamp > updatedTimestamp) {
                updatedValue = baseBeaconValue;
                updatedTimestamp = baseBeaconTimestamp;
            }
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
                    // Timestamp implicitly can't be more than 1 hours in the future due to the check in payOevBid()
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
                (
                    int224 baseBeaconValue,
                    uint32 baseBeaconTimestamp
                ) = IApi3ServerV1(api3ServerV1).dataFeeds(baseBeaconIds[ind]);
                if (
                    baseBeaconTimestamp >
                    _dataFeeds[oevBeaconIds[ind]].timestamp
                ) {
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
