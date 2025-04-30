// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/utils/UUPSUpgradeable.sol";
import "../../vendor/@openzeppelin/contracts-upgradeable@5.0.2/access/OwnableUpgradeable.sol";
import "../../vendor/@chainlink/contracts@1.2.0/src/v0.8/shared/interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/ICompositeApi3ReaderProxyV1.sol";
import "../../interfaces/IApi3ReaderProxy.sol";

/// @title UUPS-upgradeable ICompositeApi3ReaderProxyV1 and
/// AggregatorV2V3Interface implementation that is designed to be deployed by
/// CompositeApi3ReaderProxyV1Factory
/// @notice The owner of this contract is allowed to upgrade it. In the case that
/// it is deployed by CompositeApi3ReaderProxyV1Factory, the owner will be the
/// owner of CompositeApi3ReaderProxyV1Factory at the time of deployment.
/// @dev For a gas-cheap `read()` implementation, this upgradeable contract uses
/// immutable variables (rather than initializable ones). To enable this, a
/// CompositeApi3ReaderProxyV1 needs to be deployed for each unique combination
/// of variables. The end user does not need to concern themselves with this, as
/// CompositeApi3ReaderProxyV1Factory abstracts this detail away.
/// Refer to https://github.com/api3dao/migrate-from-chainlink-to-api3 for more
/// information about the Chainlink interface implementation.
contract CompositeApi3ReaderProxyV1 is
    UUPSUpgradeable,
    OwnableUpgradeable,
    AggregatorV2V3Interface,
    ICompositeApi3ReaderProxyV1
{
    /// @notice First IApi3ReaderProxy contract address
    address public immutable override proxy1;

    /// @notice Second IApi3ReaderProxy contract address
    address public immutable override proxy2;

    /// @notice Calculation type to be used for the rate composition
    CalculationType public immutable override calculationType;

    /// @dev Parameters are validated by CompositeApi3ReaderProxyV1Factory
    /// @param proxy1_ First IApi3ReaderProxy contract address
    /// @param proxy2_ Second IApi3ReaderProxy contract address
    /// @param calculationType_ Calculation type to be used for the rate composition
    constructor(
        address proxy1_,
        address proxy2_,
        CalculationType calculationType_
    ) {
        proxy1 = proxy1_;
        proxy2 = proxy2_;
        calculationType = calculationType_;
        _disableInitializers();
    }

    /// @notice Initializes the contract with the initial owner
    /// @param initialOwner Initial owner
    function initialize(address initialOwner) external override initializer {
        __Ownable_init(initialOwner);
    }

    /// @notice Returns the current value and timestamp of the rate composition
    /// between two API3 data feeds associated with the two IApi3ReaderProxy
    /// contracts
    /// @dev The value is calculated based on the calculation type and the
    /// timestamp is the earliest of the two timestamps to ensure that the data
    /// is not stale
    /// @return value Value of the rate composition
    /// @return timestamp Timestamp of the oldest data feed update
    function read()
        public
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        (int224 value1, ) = IApi3ReaderProxy(proxy1).read();
        (int224 value2, ) = IApi3ReaderProxy(proxy2).read();

        int256 val1 = int256(value1);
        int256 val2 = int256(value2);
        int256 compositeValue;

        if (calculationType == CalculationType.Divide) {
            if (val2 == 0) revert ZeroDenominator();
            compositeValue = (val1 * 1e18) / val2;
        } else if (calculationType == CalculationType.Multiply) {
            compositeValue = (val1 * val2) / 1e18;
        }

        value = int224(compositeValue);
        timestamp = uint32(block.timestamp);
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

    /// @dev The underlying proxy dAPI names act as the description, and this is
    /// left empty to save gas on contract deployment
    function description() external pure override returns (string memory) {
        return "";
    }

    /// @dev A unique version is chosen to easily check if an unverified
    /// contract that acts as a Chainlink feed is an CompositeApi3ReaderProxyV1
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
