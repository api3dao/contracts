// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access/AccessControlRegistryAdminnedWithManager.sol";
import "../DataFeedServer.sol";
import "./DapiProxy.sol";
import "../../vendor/@openzeppelin/contracts@4.8.2/utils/cryptography/ECDSA.sol";

// This contract is quite heavy, which means it has to be deployed as a proxy
contract DapiProxyWithOevV2 is
    AccessControlRegistryAdminnedWithManager,
    DataFeedServer,
    DapiProxy
{
    using ECDSA for bytes32;

    struct UpdateAllowance {
        uint128 startTimestamp;
        uint128 endTimestamp;
    }

    string public constant AUCTIONEER_ROLE_DESCRIPTION = "Auctioneer";

    bytes32 public immutable auctioneerRole;

    uint256 public immutable dappId;

    mapping(address => UpdateAllowance) public searcherToUpdateAllowance;

    // Took out the beneficiary, manager (or a withdrawer role) withdraws.
    // This makes it very difficult to add per-proxy withdrawer address in the future
    // so we need to be sure with the current monetization scheme plan.
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager,
        address _api3ServerV1,
        bytes32 _dapiNameHash,
        uint256 _dappId
    )
        AccessControlRegistryAdminnedWithManager(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager
        )
        DapiProxy(_api3ServerV1, _dapiNameHash)
    {
        require(_dappId != 0, "dApp ID zero");
        auctioneerRole = _deriveRole(
            _deriveAdminRole(manager),
            AUCTIONEER_ROLE_DESCRIPTION
        );
        dappId = _dappId;
    }

    // The searcher address specified in the bid calls this function with the exact bid amount.
    // Doing so allows the searcher to use signed data between the two timestamps.
    function payBid(
        address auctioneer,
        uint128 updateAllowanceStartTimestamp,
        uint128 updateAllowanceEndTimestamp,
        bytes calldata signature
    ) external payable {
        require(
            IAccessControlRegistry(accessControlRegistry).hasRole(
                auctioneerRole,
                auctioneer
            ),
            "Auctioneer invalid"
        );
        // The signature includes chain ID and dApp ID, doesn't care about the proxy address
        require(
            (
                keccak256(
                    abi.encodePacked(
                        "Special typehash",
                        block.chainid,
                        dappId,
                        msg.sender,
                        msg.value,
                        updateAllowanceStartTimestamp,
                        updateAllowanceEndTimestamp
                    )
                ).toEthSignedMessageHash()
            ).recover(signature) == auctioneer,
            "Signature mismatch"
        );
        UpdateAllowance storage updateAllowance = searcherToUpdateAllowance[
            msg.sender
        ];
        require(
            updateAllowance.endTimestamp < updateAllowanceEndTimestamp,
            "End timestamp stale"
        );
        searcherToUpdateAllowance[msg.sender] = UpdateAllowance({
            startTimestamp: updateAllowanceStartTimestamp,
            endTimestamp: updateAllowanceEndTimestamp
        });
        // Emit event
    }

    function withdraw(address recipient, uint256 amount) external {
        // Add a role here
        require(msg.sender == manager, "Sender not manager");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal reverted");
        // Emit event
    }

    // templateIds are the actual ones used by the dAPI (and not the once-hashed OEV ones)
    function updateOevProxyDataFeedWithSignedData(
        address[] calldata airnodes,
        bytes32[] calldata templateIds,
        uint256[] calldata timestamps,
        bytes[] calldata data,
        bytes[] calldata signatures
    ) external {
        require(
            airnodes.length == templateIds.length &&
                airnodes.length == timestamps.length &&
                airnodes.length == signatures.length,
            "Parameter length mismatch"
        );
        UpdateAllowance storage updateAllowance = searcherToUpdateAllowance[
            msg.sender
        ];
        require(
            updateAllowance.endTimestamp > block.timestamp,
            "Sender not allowed to update"
        );
        require(
            updateAllowance.startTimestamp <= block.timestamp,
            "Sender not allowed to update yet"
        );
        uint256 beaconCount = airnodes.length;
        bytes32[] memory beaconIds = new bytes32[](beaconCount);
        for (uint256 ind = 0; ind < beaconCount; ind++) {
            beaconIds[ind] = deriveBeaconId(airnodes[ind], templateIds[ind]);
            // Allow the signature to be omitted in case an API provider is not reporting.
            // See unpackAndValidateOevUpdateSignature() in OevDataFeedServer for a similar thing.
            // As a note, since omitting signatures is allowed, I didn't check if the signed data
            // timestamp is between updateAllowanceStartTimestamp and updateAllowanceEndTimestamp
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
        }
        if (beaconCount > 1) {
            updateBeaconSetWithBeacons(beaconIds);
        }
    }

    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        // Adapted from _readDataFeedWithDapiNameHashAsOevProxy() of OevDapiServer
        bytes32 dataFeedId = IApi3ServerV1(api3ServerV1)
            .dapiNameHashToDataFeedId(dapiNameHash);
        require(dataFeedId != bytes32(0), "dAPI name not set");
        DataFeed storage oevDataFeed = _dataFeeds[dataFeedId];
        (int224 dataFeedValue, uint32 dataFeedTimestamp) = IApi3ServerV1(
            api3ServerV1
        ).dataFeeds(dataFeedId);
        if (oevDataFeed.timestamp > dataFeedTimestamp) {
            (value, timestamp) = (oevDataFeed.value, oevDataFeed.timestamp);
        } else {
            (value, timestamp) = (dataFeedValue, dataFeedTimestamp);
        }
        require(timestamp > 0, "Data feed not initialized");
    }
}
