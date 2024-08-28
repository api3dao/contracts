// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../vendor/@openzeppelin/contracts@4.9.5/access/Ownable.sol";
import "../utils/ExtendedSelfMulticall.sol";
import "./interfaces/IAirseekerRegistry.sol";
import "../vendor/@openzeppelin/contracts@4.9.5/utils/structs/EnumerableSet.sol";
import "./interfaces/IApi3ServerV1.sol";

/// @title A contract where active data feeds and their specs are registered by
/// the contract owner for the Airseeker that serves them to refer to
/// @notice Airseeker is an application that pushes API provider-signed data to
/// chain when certain conditions are met so that the data feeds served on the
/// Api3ServerV1 contract are updated according to the respective specs. In
/// other words, this contract is an on-chain configuration file for an
/// Airseeker (or multiple Airseekers in a setup with redundancy).
/// The Airseeker must know which data feeds are active (and thus need to be
/// updated), the constituting Airnode (the oracle node that API providers
/// operate to sign data) addresses and request template IDs, what the
/// respective on-chain data feed values are, what the update parameters are,
/// and the URL of the signed APIs (from which Airseeker can fetch signed data)
/// that are hosted by the respective API providers.
/// The contract owner is responsible with leaving the state of this contract
/// in a way that Airseeker expects. For example, if a dAPI name is activated
/// without registering the respective data feed, the Airseeker will not have
/// access to the data that it needs to execute updates.
contract AirseekerRegistry is
    Ownable,
    ExtendedSelfMulticall,
    IAirseekerRegistry
{
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /// @notice Maximum number of Beacons in a Beacon set that can be
    /// registered
    /// @dev Api3ServerV1 introduces the concept of a Beacon, which is a
    /// single-source data feed. Api3ServerV1 allows Beacons to be read
    /// individually, or arbitrary combinations of them to be aggregated
    /// on-chain to form multiple-source data feeds, which are called Beacon
    /// sets. This contract does not support Beacon sets that consist of more
    /// than `MAXIMUM_BEACON_COUNT_IN_SET` Beacons to be registered.
    uint256 public constant override MAXIMUM_BEACON_COUNT_IN_SET = 21;

    /// @notice Maximum encoded update parameters length
    uint256 public constant override MAXIMUM_UPDATE_PARAMETERS_LENGTH = 1024;

    /// @notice Maximum signed API URL length
    uint256 public constant override MAXIMUM_SIGNED_API_URL_LENGTH = 256;

    /// @notice Api3ServerV1 contract address
    address public immutable override api3ServerV1;

    /// @notice Airnode address to signed API URL
    /// @dev An Airseeker can be configured to refer to additional signed APIs
    /// than the ones whose URLs are stored in this contract for redundancy
    mapping(address => string) public override airnodeToSignedApiUrl;

    /// @notice Data feed ID to encoded details
    mapping(bytes32 => bytes) public override dataFeedIdToDetails;

    // Api3ServerV1 uses Beacon IDs (see the `deriveBeaconId()` implementation)
    // and Beacon set IDs (see the `deriveBeaconSetId()` implementation) to
    // address data feeds. We use data feed ID as a general term to refer to a
    // Beacon ID/Beacon set ID.
    // A data feed ID is immutable (i.e., it always points to the same Beacon
    // or Beacon set). Api3ServerV1 allows a dAPI name to be pointed to a data
    // feed ID by privileged accounts to implement a mutable data feed
    // addressing scheme.
    // If the data feed ID or dAPI name should be used to read a data feed
    // depends on the use case. To support both schemes, AirseekerRegistry
    // allows data feeds specs to be defined with either the data feed ID or
    // the dAPI name.
    EnumerableSet.Bytes32Set private activeDataFeedIds;

    EnumerableSet.Bytes32Set private activeDapiNames;

    // Considering that the update parameters are typically reused between data
    // feeds, a hash map is used to avoid storing the same update parameters
    // redundantly
    mapping(bytes32 => bytes32) private dataFeedIdToUpdateParametersHash;

    mapping(bytes32 => bytes32) private dapiNameToUpdateParametersHash;

    mapping(bytes32 => bytes) private updateParametersHashToValue;

    // Length of abi.encode(address, bytes32)
    uint256 private constant DATA_FEED_DETAILS_LENGTH_FOR_SINGLE_BEACON =
        32 + 32;

    // Length of abi.encode(address[2], bytes32[2])
    uint256
        private constant DATA_FEED_DETAILS_LENGTH_FOR_BEACON_SET_WITH_TWO_BEACONS =
        32 + 32 + (32 + 2 * 32) + (32 + 2 * 32);

    // Length of
    // abi.encode(address[MAXIMUM_BEACON_COUNT_IN_SET], bytes32[MAXIMUM_BEACON_COUNT_IN_SET])
    uint256 private constant MAXIMUM_DATA_FEED_DETAILS_LENGTH =
        32 +
            32 +
            (32 + MAXIMUM_BEACON_COUNT_IN_SET * 32) +
            (32 + MAXIMUM_BEACON_COUNT_IN_SET * 32);

    /// @dev Reverts if the data feed ID is zero
    /// @param dataFeedId Data feed ID
    modifier onlyNonZeroDataFeedId(bytes32 dataFeedId) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        _;
    }

    /// @dev Reverts if the dAPI name is zero
    /// @param dapiName dAPI name
    modifier onlyNonZeroDapiName(bytes32 dapiName) {
        require(dapiName != bytes32(0), "dAPI name zero");
        _;
    }

    /// @dev Reverts if the update parameters are too long
    /// @param updateParameters Update parameters
    modifier onlyValidUpdateParameters(bytes calldata updateParameters) {
        require(
            updateParameters.length <= MAXIMUM_UPDATE_PARAMETERS_LENGTH,
            "Update parameters too long"
        );
        _;
    }

    /// @param owner_ Owner address
    /// @param api3ServerV1_ Api3ServerV1 contract address
    constructor(address owner_, address api3ServerV1_) {
        require(owner_ != address(0), "Owner address zero");
        require(api3ServerV1_ != address(0), "Api3ServerV1 address zero");
        _transferOwnership(owner_);
        api3ServerV1 = api3ServerV1_;
    }

    /// @notice Returns the owner address
    /// @return Owner address
    function owner() public view override(Ownable, IOwnable) returns (address) {
        return super.owner();
    }

    /// @notice Overriden to be disabled
    function renounceOwnership() public pure override(Ownable, IOwnable) {
        revert("Ownership cannot be renounced");
    }

    /// @notice Overriden to be disabled
    function transferOwnership(
        address
    ) public pure override(Ownable, IOwnable) {
        revert("Ownership cannot be transferred");
    }

    /// @notice Called by the owner to set the data feed ID to be activated
    /// @param dataFeedId Data feed ID
    function setDataFeedIdToBeActivated(
        bytes32 dataFeedId
    ) external override onlyOwner onlyNonZeroDataFeedId(dataFeedId) {
        if (activeDataFeedIds.add(dataFeedId)) {
            emit ActivatedDataFeedId(dataFeedId);
        }
    }

    /// @notice Called by the owner to set the dAPI name to be activated
    /// @param dapiName dAPI name
    function setDapiNameToBeActivated(
        bytes32 dapiName
    ) external override onlyOwner onlyNonZeroDapiName(dapiName) {
        if (activeDapiNames.add(dapiName)) {
            emit ActivatedDapiName(dapiName);
        }
    }

    /// @notice Called by the owner to set the data feed ID to be deactivated
    /// @param dataFeedId Data feed ID
    function setDataFeedIdToBeDeactivated(
        bytes32 dataFeedId
    ) external override onlyOwner onlyNonZeroDataFeedId(dataFeedId) {
        if (activeDataFeedIds.remove(dataFeedId)) {
            emit DeactivatedDataFeedId(dataFeedId);
        }
    }

    /// @notice Called by the owner to set the dAPI name to be deactivated
    /// @param dapiName dAPI name
    function setDapiNameToBeDeactivated(
        bytes32 dapiName
    ) external override onlyOwner onlyNonZeroDapiName(dapiName) {
        if (activeDapiNames.remove(dapiName)) {
            emit DeactivatedDapiName(dapiName);
        }
    }

    /// @notice Called by the owner to set the data feed ID update parameters.
    /// The update parameters must be encoded in a format that Airseeker
    /// expects.
    /// @param dataFeedId Data feed ID
    /// @param updateParameters Update parameters
    function setDataFeedIdUpdateParameters(
        bytes32 dataFeedId,
        bytes calldata updateParameters
    )
        external
        override
        onlyOwner
        onlyNonZeroDataFeedId(dataFeedId)
        onlyValidUpdateParameters(updateParameters)
    {
        bytes32 updateParametersHash = keccak256(updateParameters);
        if (
            dataFeedIdToUpdateParametersHash[dataFeedId] != updateParametersHash
        ) {
            dataFeedIdToUpdateParametersHash[dataFeedId] = updateParametersHash;
            if (
                updateParametersHashToValue[updateParametersHash].length !=
                updateParameters.length
            ) {
                updateParametersHashToValue[
                    updateParametersHash
                ] = updateParameters;
            }
            emit UpdatedDataFeedIdUpdateParameters(
                dataFeedId,
                updateParameters
            );
        }
    }

    /// @notice Called by the owner to set the dAPI name update parameters.
    /// The update parameters must be encoded in a format that Airseeker
    /// expects.
    /// @param dapiName dAPI name
    /// @param updateParameters Update parameters
    function setDapiNameUpdateParameters(
        bytes32 dapiName,
        bytes calldata updateParameters
    )
        external
        override
        onlyOwner
        onlyNonZeroDapiName(dapiName)
        onlyValidUpdateParameters(updateParameters)
    {
        bytes32 updateParametersHash = keccak256(updateParameters);
        if (dapiNameToUpdateParametersHash[dapiName] != updateParametersHash) {
            dapiNameToUpdateParametersHash[dapiName] = updateParametersHash;
            if (
                updateParametersHashToValue[updateParametersHash].length !=
                updateParameters.length
            ) {
                updateParametersHashToValue[
                    updateParametersHash
                ] = updateParameters;
            }
            emit UpdatedDapiNameUpdateParameters(dapiName, updateParameters);
        }
    }

    /// @notice Called by the owner to set the signed API URL for the Airnode.
    /// The signed API must implement the specific interface that Airseeker
    /// expects.
    /// @param airnode Airnode address
    /// @param signedApiUrl Signed API URL
    function setSignedApiUrl(
        address airnode,
        string calldata signedApiUrl
    ) external override onlyOwner {
        require(airnode != address(0), "Airnode address zero");
        require(
            abi.encodePacked(signedApiUrl).length <=
                MAXIMUM_SIGNED_API_URL_LENGTH,
            "Signed API URL too long"
        );
        if (
            keccak256(abi.encodePacked(airnodeToSignedApiUrl[airnode])) !=
            keccak256(abi.encodePacked(signedApiUrl))
        ) {
            airnodeToSignedApiUrl[airnode] = signedApiUrl;
            emit UpdatedSignedApiUrl(airnode, signedApiUrl);
        }
    }

    /// @notice Registers the data feed. In the case that the data feed is a
    /// Beacon, the details should be the ABI-encoded Airnode address and
    /// template ID. In the case that the data feed is a Beacon set, the
    /// details should be the ABI-encoded Airnode addresses array and template
    /// IDs array.
    /// @param dataFeedDetails Data feed details
    /// @return dataFeedId Data feed ID
    function registerDataFeed(
        bytes calldata dataFeedDetails
    ) external override returns (bytes32 dataFeedId) {
        uint256 dataFeedDetailsLength = dataFeedDetails.length;
        if (
            dataFeedDetailsLength == DATA_FEED_DETAILS_LENGTH_FOR_SINGLE_BEACON
        ) {
            // dataFeedId maps to a Beacon
            (address airnode, bytes32 templateId) = abi.decode(
                dataFeedDetails,
                (address, bytes32)
            );
            require(airnode != address(0), "Airnode address zero");
            dataFeedId = deriveBeaconId(airnode, templateId);
        } else if (
            dataFeedDetailsLength >=
            DATA_FEED_DETAILS_LENGTH_FOR_BEACON_SET_WITH_TWO_BEACONS
        ) {
            require(
                dataFeedDetailsLength <= MAXIMUM_DATA_FEED_DETAILS_LENGTH,
                "Data feed details too long"
            );
            (address[] memory airnodes, bytes32[] memory templateIds) = abi
                .decode(dataFeedDetails, (address[], bytes32[]));
            require(
                abi.encode(airnodes, templateIds).length ==
                    dataFeedDetailsLength,
                "Data feed details trail"
            );
            uint256 beaconCount = airnodes.length;
            require(
                beaconCount == templateIds.length,
                "Parameter length mismatch"
            );
            bytes32[] memory beaconIds = new bytes32[](beaconCount);
            for (uint256 ind = 0; ind < beaconCount; ind++) {
                require(airnodes[ind] != address(0), "Airnode address zero");
                beaconIds[ind] = deriveBeaconId(
                    airnodes[ind],
                    templateIds[ind]
                );
            }
            dataFeedId = deriveBeaconSetId(beaconIds);
        } else {
            revert("Data feed details too short");
        }
        if (dataFeedIdToDetails[dataFeedId].length != dataFeedDetailsLength) {
            dataFeedIdToDetails[dataFeedId] = dataFeedDetails;
            emit RegisteredDataFeed(dataFeedId, dataFeedDetails);
        }
    }

    /// @notice In an imaginary array consisting of the the active data feed
    /// IDs and active dAPI names, picks the index-th identifier, and returns
    /// all data about the respective data feed that is available. Whenever
    /// data is not available (including the case where index does not
    /// correspond to an active data feed), returns empty values.
    /// @dev Airseeker uses this function to get all the data it needs about an
    /// active data feed with a single RPC call
    /// @param index Index
    /// @return dataFeedId Data feed ID
    /// @return dapiName dAPI name (`bytes32(0)` if the active data feed is
    /// identified by a data feed ID)
    /// @return dataFeedDetails Data feed details
    /// @return dataFeedValue Data feed value read from Api3ServerV1
    /// @return dataFeedTimestamp Data feed timestamp read from Api3ServerV1
    /// @return beaconValues Beacon values read from Api3ServerV1
    /// @return beaconTimestamps Beacon timestamps read from Api3ServerV1
    /// @return updateParameters Update parameters
    /// @return signedApiUrls Signed API URLs of the Beacon Airnodes
    function activeDataFeed(
        uint256 index
    )
        external
        view
        override
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
        )
    {
        uint256 activeDataFeedIdsLength = activeDataFeedIdCount();
        if (index < activeDataFeedIdsLength) {
            dataFeedId = activeDataFeedIds.at(index);
            updateParameters = dataFeedIdToUpdateParameters(dataFeedId);
        } else if (index < activeDataFeedIdsLength + activeDapiNames.length()) {
            dapiName = activeDapiNames.at(index - activeDataFeedIdsLength);
            dataFeedId = IApi3ServerV1(api3ServerV1).dapiNameHashToDataFeedId(
                keccak256(abi.encodePacked(dapiName))
            );
            updateParameters = dapiNameToUpdateParameters(dapiName);
        }
        if (dataFeedId != bytes32(0)) {
            dataFeedDetails = dataFeedIdToDetails[dataFeedId];
            (dataFeedValue, dataFeedTimestamp) = IApi3ServerV1(api3ServerV1)
                .dataFeeds(dataFeedId);
        }
        if (dataFeedDetails.length != 0) {
            if (
                dataFeedDetails.length ==
                DATA_FEED_DETAILS_LENGTH_FOR_SINGLE_BEACON
            ) {
                beaconValues = new int224[](1);
                beaconTimestamps = new uint32[](1);
                signedApiUrls = new string[](1);
                (address airnode, bytes32 templateId) = abi.decode(
                    dataFeedDetails,
                    (address, bytes32)
                );
                (beaconValues[0], beaconTimestamps[0]) = IApi3ServerV1(
                    api3ServerV1
                ).dataFeeds(deriveBeaconId(airnode, templateId));
                signedApiUrls[0] = airnodeToSignedApiUrl[airnode];
            } else {
                (address[] memory airnodes, bytes32[] memory templateIds) = abi
                    .decode(dataFeedDetails, (address[], bytes32[]));
                uint256 beaconCount = airnodes.length;
                beaconValues = new int224[](beaconCount);
                beaconTimestamps = new uint32[](beaconCount);
                signedApiUrls = new string[](beaconCount);
                for (uint256 ind = 0; ind < beaconCount; ind++) {
                    (beaconValues[ind], beaconTimestamps[ind]) = IApi3ServerV1(
                        api3ServerV1
                    ).dataFeeds(
                            deriveBeaconId(airnodes[ind], templateIds[ind])
                        );
                    signedApiUrls[ind] = airnodeToSignedApiUrl[airnodes[ind]];
                }
            }
        }
    }

    /// @notice Returns the number of active data feeds identified by a data
    /// feed ID or dAPI name
    /// @return Active data feed count
    function activeDataFeedCount() external view override returns (uint256) {
        return activeDataFeedIdCount() + activeDapiNameCount();
    }

    /// @notice Returns the number of active data feeds identified by a data
    /// feed ID
    /// @return Active data feed ID count
    function activeDataFeedIdCount() public view override returns (uint256) {
        return activeDataFeedIds.length();
    }

    /// @notice Returns the number of active data feeds identified by a dAPI
    /// name
    /// @return Active dAPI name count
    function activeDapiNameCount() public view override returns (uint256) {
        return activeDapiNames.length();
    }

    /// @notice Data feed ID to update parameters
    /// @param dataFeedId Data feed ID
    /// @return updateParameters Update parameters
    function dataFeedIdToUpdateParameters(
        bytes32 dataFeedId
    ) public view override returns (bytes memory updateParameters) {
        updateParameters = updateParametersHashToValue[
            dataFeedIdToUpdateParametersHash[dataFeedId]
        ];
    }

    /// @notice dAPI name to update parameters
    /// @param dapiName dAPI name
    /// @return updateParameters Update parameters
    function dapiNameToUpdateParameters(
        bytes32 dapiName
    ) public view override returns (bytes memory updateParameters) {
        updateParameters = updateParametersHashToValue[
            dapiNameToUpdateParametersHash[dapiName]
        ];
    }

    /// @notice Returns if the data feed with ID is registered
    /// @param dataFeedId Data feed ID
    /// @return If the data feed with ID is registered
    function dataFeedIsRegistered(
        bytes32 dataFeedId
    ) external view override returns (bool) {
        return dataFeedIdToDetails[dataFeedId].length != 0;
    }

    /// @notice Derives the Beacon ID from the Airnode address and template ID
    /// @param airnode Airnode address
    /// @param templateId Template ID
    /// @return beaconId Beacon ID
    function deriveBeaconId(
        address airnode,
        bytes32 templateId
    ) private pure returns (bytes32 beaconId) {
        beaconId = keccak256(abi.encodePacked(airnode, templateId));
    }

    /// @notice Derives the Beacon set ID from the Beacon IDs
    /// @param beaconIds Beacon IDs
    /// @return beaconSetId Beacon set ID
    function deriveBeaconSetId(
        bytes32[] memory beaconIds
    ) private pure returns (bytes32 beaconSetId) {
        beaconSetId = keccak256(abi.encode(beaconIds));
    }
}
