// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DapiProxy.sol";
import "./interfaces/IOevProxy.sol";
import "../../vendor/@openzeppelin/contracts@4.8.2/utils/cryptography/ECDSA.sol";

// TODO: Update all docstrings
/// @title An immutable proxy contract that is used to read a specific dAPI of
/// a specific Api3ServerV1 contract and inform Api3ServerV1 about the
/// beneficiary of the respective OEV proceeds
/// @notice In an effort to reduce the bytecode of this contract, its
/// constructor arguments are validated by ProxyFactory, rather than
/// internally. If you intend to deploy this contract without using
/// ProxyFactory, you are recommended to implement an equivalent validation.
/// @dev See DapiProxy.sol for comments about usage
contract DapiProxyWithOev2 is DapiProxy, IOevProxy {
    using ECDSA for bytes32;

    /// @notice OEV beneficiary address
    address public immutable override oevBeneficiary;

    int224 oevValue;
    uint32 oevTimestamp;

    /// @param _api3ServerV1 Api3ServerV1 address
    /// @param _dapiNameHash Hash of the dAPI name
    /// @param _oevBeneficiary OEV beneficiary
    constructor(
        address _api3ServerV1,
        bytes32 _dapiNameHash,
        address _oevBeneficiary
    ) DapiProxy(_api3ServerV1, _dapiNameHash) {
        oevBeneficiary = _oevBeneficiary;
    }

    /// @notice Reads the dAPI that this proxy maps to
    /// @return value dAPI value
    /// @return timestamp dAPI timestamp
    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        (int224 baseValue, uint32 baseTimestamp) = IApi3ServerV1(api3ServerV1)
            .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);

        if (oevTimestamp > baseTimestamp) {
            return (oevValue, oevTimestamp);
        } else {
            return (baseValue, baseTimestamp);
        }
    }

    function updateOevDataFeed(
        address auctioneer,
        address[] calldata airnodes,
        bytes32[] calldata templateIds,
        bytes calldata packedUpdateSignature
    ) external {
        // TODO: Require that auctioneer address is whitelisted
        (uint256 expiration, bytes memory signature) = abi.decode(
            packedUpdateSignature,
            (uint256, bytes)
        );
        require(block.timestamp <= expiration, "Signature expired");
        require(
            (
                keccak256(
                    abi.encodePacked(
                        block.chainid,
                        address(this),
                        msg.sender,
                        expiration
                    )
                ).toEthSignedMessageHash()
            ).recover(signature) == auctioneer,
            "Signature mismatch"
        );
        bytes32[] memory oevTemplateIds = new bytes32[](templateIds.length);
        for (uint256 i = 0; i < templateIds.length; i++) {
            oevTemplateIds[i] = keccak256(abi.encodePacked(templateIds[i]));
        }
        bytes32[] memory oevBeaconIds = new bytes32[](airnodes.length);
        for (uint256 i = 0; i < airnodes.length; i++) {
            oevBeaconIds[i] = keccak256(
                abi.encodePacked(airnodes[i], oevTemplateIds[i])
            );
        }
        bytes32 oevDataFeedId = airnodes.length == 1
            ? oevBeaconIds[0]
            : keccak256(abi.encode(oevBeaconIds));
        (oevValue, oevTimestamp) = IApi3ServerV1(api3ServerV1)
            .readDataFeedWithId(oevDataFeedId);
    }
}
