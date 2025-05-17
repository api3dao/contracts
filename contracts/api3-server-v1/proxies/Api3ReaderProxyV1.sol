// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/utils/UUPSUpgradeable.sol";
import "../../vendor/@openzeppelin/contracts-upgradeable@5.0.2/access/OwnableUpgradeable.sol";
import "../../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/IApi3ReaderProxyV1.sol";
import "../interfaces/IApi3ServerV1.sol";
import "../interfaces/IApi3ServerV1OevExtension.sol";

/// @title UUPS-upgradeable IApi3ReaderProxy and AggregatorV2V3Interface
/// implementation that is designed to be deployed by Api3ReaderProxyV1Factory
/// @notice The owner of this contract is allowed to upgrade it. In the case
/// that it is deployed by Api3ReaderProxyV1Factory, the owner will be the
/// owner of Api3ReaderProxyV1Factory at the time of deployment.
/// @dev For a gas-cheap `read()` implementation, this upgradeable contract
/// uses immutable variables (rather than initializable ones). To enable this,
/// an Api3ReaderProxyV1 needs to be deployed for each unique combination of
/// variables. The end user does not need to concern themselves with this, as
/// Api3ReaderProxyV1Factory abstracts this detail away.
/// Refer to https://github.com/api3dao/migrate-from-chainlink-to-api3 for more
/// information about the Chainlink interface implementation.
contract Api3ReaderProxyV1 is
    UUPSUpgradeable,
    OwnableUpgradeable,
    AggregatorV2V3Interface,
    IApi3ReaderProxyV1
{
    /// @notice Api3ServerV1 contract address
    address public immutable override api3ServerV1;

    /// @notice Api3ServerV1OevExtension contract address
    address public immutable override api3ServerV1OevExtension;

    /// @notice dAPI name as a bytes32 string
    bytes32 public immutable override dapiName;

    /// @notice dApp ID
    uint256 public immutable override dappId;

    // Api3ServerV1 interface expects the dAPI name hash. keccak256 is
    // typically expensive on ZK roll-ups, so we compute it once and store it
    // to use during reads.
    bytes32 private immutable dapiNameHash;

    /// @dev Parameters are validated by Api3ReaderProxyV1Factory
    /// @param api3ServerV1OevExtension_ Api3ServerV1OevExtension contract
    /// address
    /// @param dapiName_ dAPI name as a bytes32 string
    /// @param dappId_ dApp ID
    constructor(
        address api3ServerV1OevExtension_,
        bytes32 dapiName_,
        uint256 dappId_
    ) {
        api3ServerV1OevExtension = api3ServerV1OevExtension_;
        api3ServerV1 = IApi3ServerV1OevExtension(api3ServerV1OevExtension_)
            .api3ServerV1();
        dapiName = dapiName_;
        dappId = dappId_;
        dapiNameHash = keccak256(abi.encodePacked(dapiName));
        _disableInitializers();
    }

    /// @notice Initializes the contract with the initial owner
    /// @param initialOwner Initial owner
    function initialize(address initialOwner) external override initializer {
        __Ownable_init(initialOwner);
    }

    /// @notice Returns the current value and timestamp of the API3 data feed
    /// associated with the proxy contract
    /// @dev Reads the base feed that is associated to the dAPI and the OEV
    /// feed that is associated to the dApp–dAPI pair, and returns the value
    /// that is updated more recently
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function read()
        public
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        bytes32 dataFeedId = IApi3ServerV1(api3ServerV1)
            .dapiNameHashToDataFeedId(dapiNameHash);
        if (dataFeedId == bytes32(0)) {
            revert DapiNameIsNotSet();
        }
        (int224 baseDapiValue, uint32 baseDapiTimestamp) = IApi3ServerV1(
            api3ServerV1
        ).dataFeeds(dataFeedId);
        (
            int224 oevDapiValue,
            uint32 oevDapiTimestamp
        ) = IApi3ServerV1OevExtension(api3ServerV1OevExtension).oevDataFeed(
                dappId,
                dataFeedId
            );
        if (oevDapiTimestamp > baseDapiTimestamp) {
            (value, timestamp) = (oevDapiValue, oevDapiTimestamp);
        } else {
            (value, timestamp) = (baseDapiValue, baseDapiTimestamp);
        }
        if (timestamp == 0) {
            revert DataFeedIsNotInitialized();
        }
    }

    /// @dev AggregatorV2V3Interface users are already responsible with
    /// validating the values that they receive (e.g., revert if the spot price
    /// of an asset is negative). Therefore, this contract omits validation.
    function latestAnswer() external view override returns (int256 value) {
        (value, ) = read();
    }

    /// @dev A Chainlink feed contract returns the block timestamp at which the
    /// feed was last updated. On the other hand, an API3 feed timestamp
    /// denotes the point in time at which the first-party oracles signed the
    /// data used to do the last update. We find this to be a reasonable
    /// approximation, considering that usually the timestamp is only used to
    /// check if the last update is stale.
    function latestTimestamp()
        external
        view
        override
        returns (uint256 timestamp)
    {
        (, timestamp) = read();
    }

    /// @dev API3 feeds are updated asynchronously and not in rounds
    function latestRound() external pure override returns (uint256) {
        revert FunctionIsNotSupported();
    }

    /// @dev Functions that use the round ID as an argument are not supported
    function getAnswer(uint256) external pure override returns (int256) {
        revert FunctionIsNotSupported();
    }

    /// @dev Functions that use the round ID as an argument are not supported
    function getTimestamp(uint256) external pure override returns (uint256) {
        revert FunctionIsNotSupported();
    }

    /// @dev API3 feeds always use 18 decimals
    function decimals() external pure override returns (uint8) {
        return 18;
    }

    /// @dev The dApp ID and dAPI name act as the description, and this is left
    /// empty to save gas on contract deployment
    function description() external pure override returns (string memory) {
        return "";
    }

    /// @dev A unique version is chosen to easily check if an unverified
    /// contract that acts as a Chainlink feed is an Api3ReaderProxyV1
    function version() external pure override returns (uint256) {
        return 4913;
    }

    /// @dev Functions that use the round ID as an argument are not supported
    function getRoundData(
        uint80
    )
        external
        pure
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        revert FunctionIsNotSupported();
    }

    /// @dev Rounds IDs are returned as `0` as invalid values.
    /// Similar to `latestAnswer()`, we leave the validation of the returned
    /// value to the caller.
    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = answeredInRound = 0;
        (answer, startedAt) = read();
        updatedAt = startedAt;
    }

    /// @param newImplementation New implementation contract address
    /// @dev Only the owner can upgrade this contract
    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyOwner {}
}
