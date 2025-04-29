// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/utils/UUPSUpgradeable.sol";
import "../../vendor/@openzeppelin/contracts-upgradeable@5.0.2/access/OwnableUpgradeable.sol";
import "../../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/IApi3CrossRateReaderProxyV1.sol";
import "../../interfaces/IApi3ReaderProxy.sol";

/// @title UUPS-upgradeable IApi3CrossRateReaderProxyV1 and
/// AggregatorV2V3Interface implementation that is designed to be deployed by
/// Api3CrossRateReaderProxyV1Factory
/// @notice The owner of this contract is allowed to upgrade it. In the case
/// that it is deployed by Api3CrossRateReaderProxyV1Factory, the owner will be
/// the owner of Api3CrossRateReaderProxyV1Factory at the time of deployment.
/// @dev For a gas-cheap `read()` implementation, this upgradeable contract
/// uses immutable variables (rather than initializable ones). To enable this,
/// an Api3CrossRateReaderProxyV1 needs to be deployed for each unique
/// combination of variables. The end user does not need to concern themselves
/// with this, as Api3CrossRateReaderProxyV1Factory abstracts this detail away.
/// Refer to https://github.com/api3dao/migrate-from-chainlink-to-api3 for more
/// information about the Chainlink interface implementation.
contract Api3CrossRateReaderProxyV1 is
    UUPSUpgradeable,
    OwnableUpgradeable,
    AggregatorV2V3Interface,
    IApi3CrossRateReaderProxyV1
{
    /// @notice First IApi3ReaderProxy contract address
    address public immutable override proxy1;

    /// @notice Second IApi3ReaderProxy contract address
    address public immutable override proxy2;

    /// @notice Calculation type to be used for the cross rate
    CalculationType public immutable override calculationType;

    /// @notice Derived dAPI name of the cross rate as a bytes32 string
    /// @dev For example if the two proxies are "USD/USDT" and "USDT/EUR", the
    /// derived dAPI name should be "USD/EUR". This is just for informational
    /// purposes and is not used in any calculations
    bytes32 public immutable override crossRateDapiName;

    /// @dev Parameters are validated by Api3CrossRateReaderProxyV1Factory
    /// @param proxy1_ First IApi3ReaderProxy contract address
    /// @param proxy2_ Second IApi3ReaderProxy contract address
    /// @param calculationType_ Calculation type to be used for the cross rate
    /// @param crossRateDapiName_ dAPI name of the cross rate as a bytes32 string
    constructor(
        address proxy1_,
        address proxy2_,
        CalculationType calculationType_,
        bytes32 crossRateDapiName_
    ) {
        proxy1 = proxy1_;
        proxy2 = proxy2_;
        calculationType = calculationType_;
        crossRateDapiName = crossRateDapiName_;
        _disableInitializers();
    }

    /// @notice Initializes the contract with the initial owner
    /// @param initialOwner Initial owner
    function initialize(address initialOwner) external override initializer {
        __Ownable_init(initialOwner);
    }

    /// @notice Returns the current value and timestamp of the cross rate between
    /// two API3 data feeds associated with the two IApi3ReaderProxy contracts
    /// @dev The value is calculated based on the calculation type and the
    /// timestamp is the earliest of the two timestamps to ensure that the data
    /// is not stale
    /// @return value Cross rate between the two data feed values
    /// @return timestamp Timestamp of the oldest data feed update
    function read()
        public
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        (int224 value1, uint32 timestamp1) = IApi3ReaderProxy(proxy1).read();
        (int224 value2, uint32 timestamp2) = IApi3ReaderProxy(proxy2).read();

        int256 val1 = int256(value1);
        int256 val2 = int256(value2);
        int256 crossRate;

        if (calculationType == CalculationType.Divide1By2) {
            if (val2 == 0) revert ProxyReturnedZero(proxy2);
            crossRate = (val1 * 1e18) / val2;
        } else if (calculationType == CalculationType.Divide2By1) {
            if (val1 == 0) revert ProxyReturnedZero(proxy1);
            crossRate = (val2 * 1e18) / val1;
        } else if (calculationType == CalculationType.Multiply) {
            crossRate = (val1 * val2) / 1e18;
        }

        value = int224(crossRate);
        timestamp = timestamp1 < timestamp2 ? timestamp1 : timestamp2;
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

    /// @dev The cross-rate dAPI name act as the description, and this is left
    /// empty to save gas on contract deployment
    function description() external pure override returns (string memory) {
        return "";
    }

    /// @dev A unique version is chosen to easily check if an unverified
    /// contract that acts as a Chainlink feed is an Api3CrossRateReaderProxyV1
    function version() external pure override returns (uint256) {
        return 4914;
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
