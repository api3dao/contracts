// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../access/interfaces/IAccessControlRegistryAdminnedWithManager.sol";

interface IOevAuctionHouse is IAccessControlRegistryAdminnedWithManager {
    enum BidStatus {
        None,
        Placed,
        Awarded,
        FulfillmentReported,
        FulfillmentConfirmed,
        FulfillmentContradicted
    }

    event SetCollateralInBasisPoints(uint256 collateralInBasisPoints);

    event SetProtocolFeeInBasisPoints(uint256 protocolFeeInBasisPoints);

    event SetCollateralRateProxy(address collateralRateProxy);

    event SetChainNativeCurrencyRateProxy(
        uint256 indexed chainId,
        address nativeCurrencyRateProxy
    );

    event WithdrewAccumulatedSlashedCollateral(
        address recipient,
        uint256 amount
    );

    event WithdrewAccumulatedProtocolFees(address recipient, uint256 amount);

    event Deposited(
        address indexed bidder,
        uint256 amount,
        uint256 bidderBalance,
        address sender
    );

    event InitiatedWithdrawal(
        address indexed bidder,
        uint256 earliestWithdrawalTimestamp
    );

    event Withdrew(address indexed bidder, address recipient, uint256 amount);

    event CanceledWithdrawal(address indexed bidder);

    event PlacedBid(
        address indexed bidder,
        bytes32 indexed bidTopic,
        bytes32 indexed bidId,
        uint256 chainId,
        uint256 bidAmount,
        bytes bidDetails,
        uint32 expirationTimestamp,
        uint104 collateralAmount,
        uint104 protocolFeeAmount
    );

    event ExpeditedBidExpiration(
        address indexed bidder,
        bytes32 indexed bidTopic,
        bytes32 indexed bidId,
        uint32 expirationTimestamp
    );

    event AwardedBid(
        address indexed bidder,
        bytes32 indexed bidTopic,
        bytes32 indexed bidId,
        bytes awardDetails,
        uint256 bidderBalance
    );

    event ReportedFulfillment(
        address indexed bidder,
        bytes32 indexed bidTopic,
        bytes32 indexed bidId,
        bytes fulfillmentDetails
    );

    event ConfirmedFulfillment(
        address indexed bidder,
        bytes32 indexed bidTopic,
        bytes32 indexed bidId,
        uint256 bidderBalance,
        uint256 accumulatedProtocolFees
    );

    event ContradictedFulfillment(
        address indexed bidder,
        bytes32 indexed bidTopic,
        bytes32 indexed bidId,
        uint256 bidderBalance,
        uint256 accumulatedSlashedCollateral
    );

    error SenderIsNotTheManager();

    error SenderIsNotAProxySetterOrTheManager();

    error SenderIsNotAWithdrawerOrTheManager();

    error SenderIsNotAnAuctioneer();

    error ProxyAddressIsZero();

    error ChainIdIsZero();

    error RecipientAddressIsZero();

    error WithdrawalAmountIsZero();

    error InsufficientBalance();

    error BidderAddressIsZero();

    error DepositAmountIsZero();

    error BidderHasAlreadyInitiatedWithdrawal();

    error SenderHasNotInitiatedWithdrawal();

    error BidderCannotWithdrawYet();

    error BidAmountIsZero();

    error BidDetailsAreEmpty();

    error MaximumBidderDataLengthIsExceeded();

    error BidLifetimeIsLongerThanMaximum();

    error BidLifetimeIsShorterThanMinimum();

    error BidIsAlreadyPlaced();

    error MaxCollateralAmountIsExceeded();

    error MaxProtocolFeeAmountIsExceeded();

    error BidIsNotAwaitingAward();

    error BidHasExpired();

    error TimestampDoesNotExpediteExpiration();

    error MaximumAuctioneerDataLengthIsExceeded();

    error AwardDetailsAreEmpty();

    error AwardHasExpired();

    error BidderBalanceIsLowerThanTheLockedAmount();

    error FulfillmentDetailsAreEmpty();

    error BidIsNotAwaitingFulfillmentReport();

    error BidFulfillmentCannotBeConfirmed();

    error BidFulfillmentCannotBeContradicted();

    error CollateralRateIsNotPositive();

    error CollateralRateIsStale();

    error NativeCurrencyRateIsNotPositive();

    error NativeCurrencyRateIsStale();

    function setProtocolFeeInBasisPoints(
        uint256 protocolFeeInBasisPoints_
    ) external;

    function setCollateralInBasisPoints(
        uint256 collateralInBasisPoints_
    ) external;

    function setCollateralRateProxy(address collateralRateProxy_) external;

    function setChainNativeCurrencyRateProxy(
        uint256 chainId,
        address nativeCurrencyRateProxy
    ) external;

    function withdrawAccumulatedSlashedCollateral(
        address payable recipient,
        uint256 amount
    ) external;

    function withdrawAccumulatedProtocolFees(
        address payable recipient,
        uint256 amount
    ) external;

    function depositForBidder(
        address bidder
    ) external payable returns (uint256 bidderBalance);

    function deposit() external payable returns (uint256 bidderBalance);

    function initiateWithdrawal()
        external
        returns (uint256 earliestWithdrawalTimestamp);

    function withdraw(address payable recipient, uint256 amount) external;

    function cancelWithdrawal() external;

    function placeBidWithExpiration(
        bytes32 bidTopic,
        uint256 chainId,
        uint256 bidAmount,
        bytes calldata bidDetails,
        uint256 maxCollateralAmount,
        uint256 maxProtocolFeeAmount,
        uint32 expirationTimestamp
    ) external returns (uint104 collateralAmount, uint104 protocolFeeAmount);

    function placeBid(
        bytes32 bidTopic,
        uint256 chainId,
        uint256 bidAmount,
        bytes calldata bidDetails,
        uint256 maxCollateralAmount,
        uint256 maxProtocolFeeAmount
    )
        external
        returns (
            uint32 expirationTimestamp,
            uint104 collateralAmount,
            uint104 protocolFeeAmount
        );

    function expediteBidExpiration(
        bytes32 bidTopic,
        bytes32 bidDetailsHash,
        uint32 expirationTimestamp
    ) external;

    function expediteBidExpirationMaximally(
        bytes32 bidTopic,
        bytes32 bidDetailsHash
    ) external returns (uint32 expirationTimestamp);

    function awardBid(
        address bidder,
        bytes32 bidTopic,
        bytes32 bidDetailsHash,
        bytes calldata awardDetails,
        uint256 awardExpirationTimestamp
    ) external returns (uint256 bidderBalance);

    function reportFulfillment(
        bytes32 bidTopic,
        bytes32 bidDetailsHash,
        bytes calldata fulfillmentDetails
    ) external;

    function confirmFulfillment(
        address bidder,
        bytes32 bidTopic,
        bytes32 bidDetailsHash
    )
        external
        returns (uint256 bidderBalance, uint256 accumulatedProtocolFees_);

    function contradictFulfillment(
        address bidder,
        bytes32 bidTopic,
        bytes32 bidDetailsHash
    )
        external
        returns (uint256 bidderBalance, uint256 accumulatedSlashedCollateral_);

    function getCurrentCollateralAndProtocolFeeAmounts(
        uint256 chainId,
        uint256 bidAmount
    )
        external
        view
        returns (uint104 collateralAmount, uint104 protocolFeeAmount);

    function PROXY_SETTER_ROLE_DESCRIPTION() external returns (string memory);

    function WITHDRAWER_ROLE_DESCRIPTION() external returns (string memory);

    function AUCTIONEER_ROLE_DESCRIPTION() external returns (string memory);

    function WITHDRAWAL_WAITING_PERIOD() external returns (uint256);

    function MAXIMUM_BID_LIFETIME() external returns (uint256);

    function MINIMUM_BID_LIFETIME() external returns (uint256);

    function FULFILLMENT_REPORTING_PERIOD() external returns (uint256);

    function MAXIMUM_BIDDER_DATA_LENGTH() external returns (uint256);

    function MAXIMUM_AUCTIONEER_DATA_LENGTH() external returns (uint256);

    function proxySetterRole() external returns (bytes32);

    function withdrawerRole() external returns (bytes32);

    function auctioneerRole() external returns (bytes32);

    function protocolFeeInBasisPoints() external returns (uint256);

    function collateralInBasisPoints() external returns (uint256);

    function collateralRateProxy() external returns (address);

    function chainIdToNativeCurrencyRateProxy(
        uint256 chainId
    ) external returns (address nativeCurrencyRateProxy);

    function accumulatedSlashedCollateral() external returns (uint256);

    function accumulatedProtocolFees() external returns (uint256);

    function bidderToBalance(address bidder) external returns (uint256 balance);

    function bidderToEarliestWithdrawalTimestamp(
        address bidder
    ) external returns (uint256 earliestWithdrawalTimestamp);

    function bids(
        bytes32 bidId
    )
        external
        returns (
            BidStatus status,
            uint32 expirationTimestamp,
            uint104 collateralAmount,
            uint104 protocolFeeAmount
        );
}
