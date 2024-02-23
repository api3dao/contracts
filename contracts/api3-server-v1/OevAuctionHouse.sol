// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../access/AccessControlRegistryAdminnedWithManager.sol";
import "./interfaces/IOevAuctionHouse.sol";
import "./proxies/interfaces/IProxy.sol";

/// @title OEV Auction House contract
/// @notice OEV is a subset of MEV that oracles have exclusive priority of
/// extraction. API3 holds OEV auctions for its data feed services and forwards
/// the proceeds to the respective user dApps. OevAuctionHouse is the platform
/// that OEV searchers can bid on data feed updates that satisfy specific
/// conditions, and report that they have fulfilled the updates that they are
/// awarded. Refer to Api3ServerV1.sol for how the awarded updates are to be
/// fulfilled and how the beneficiaries can withdraw the auction proceeds.
/// @dev OevAuctionHouse is intended to be deployed on a single chain, while
/// Api3ServerV1 (the API3 data feed contract) is deployed on the chains that
/// the respective user dApps are deployed on. An OEV searcher bids on an
/// update at OevAuctionHouse, gets the larger of the collateral and protocol
/// fee locked up at OevAuctionHouse when they are awarded the update, fulfill
/// the update and pay their bid amount at Api3ServerV1, and report back to
/// OevAuctionHouse to have their locked funds released and the protocol fee
/// charged. This flow implies the need for a certain kind of a cross-chain
/// oracle functionality (to check if the awarded update is fulfilled), which
/// is provided by the auctioneer role in this contract. The same auctioneer
/// role is also assigned to award the individual updates to the winning bids.
/// This means that the trustlessness of the auctions is limited by the
/// trustlessness of the auctioneer implementation. Although trustlessness of
/// OEV auctions is ideal, the primary goal of OevAuctionHouse is to facilitate
/// auctions in a transparent and accountable manner.
contract OevAuctionHouse is
    AccessControlRegistryAdminnedWithManager,
    IOevAuctionHouse
{
    // The collateral and protocol fee amounts are denominated in the native
    // currency of the chain that OevAuctionHouse is deployed on. In the case
    // that this currency is ETH, the variable sizes below for collateral and
    // protocol fee are expected to be sufficient.
    struct Bid {
        BidStatus status;
        uint32 expirationTimestamp;
        uint104 collateralAmount;
        uint104 protocolFeeAmount;
    }

    /// @notice Proxy setter role description
    string public constant override PROXY_SETTER_ROLE_DESCRIPTION =
        "Proxy setter";

    /// @notice Withdrawer role description
    string public constant override WITHDRAWER_ROLE_DESCRIPTION = "Withdrawer";

    /// @notice Auctioneer role description
    string public constant override AUCTIONEER_ROLE_DESCRIPTION = "Auctioneer";

    /// @notice Amount of time that the bidders are required to wait after
    /// initiating a withdrawal to execute it
    /// @dev This is enforced to prevent the bidders from frontrunning bid
    /// awarding transactions with withdrawals to deny service
    uint256 public constant override WITHDRAWAL_WAITING_PERIOD = 15 seconds;

    /// @notice Longest period during which a bid can be awarded after it has
    /// been placed
    /// @dev Considering each bid for each auction incurs a (computational,
    /// network, etc.) cost to the auctioneer, the bids need to automatically
    /// fall out of scope over time or they will eventually accumulate to an
    /// unmanageable amount
    uint256 public constant override MAXIMUM_BID_LIFETIME = 1 days;

    /// @notice Minimum lifetime that a bid can be specified to have
    /// @dev This is enforced to prevent bidders from frontrunning bid awarding
    /// transactions with bid expiration expedition transactions to deny
    /// service
    uint256 public constant override MINIMUM_BID_LIFETIME = 15 seconds;

    /// @notice Period during which a bidder is allowed to report the
    /// fulfillment after the bid award
    /// @dev The bidder should execute the won update in a matter of seconds,
    /// and the fulfillment report can follow right after. However, the
    /// fulfillment reporting period is kept long enough to accomodate for a
    /// more relaxed workflow, e.g., the bidder multi-calls their fulfillment
    /// reports every hour.
    uint256 public constant override FULFILLMENT_REPORTING_PERIOD = 1 days;

    /// @notice Maximum data length that a bidder can submit while placing a
    /// bid or reporting a fulfillment
    uint256 public constant override MAXIMUM_BIDDER_DATA_LENGTH = 1024;

    /// @notice Maximum data length that an auctioneer can submit while
    /// awarding a bid
    uint256 public constant override MAXIMUM_AUCTIONEER_DATA_LENGTH = 8192;

    /// @notice Proxy setter role
    bytes32 public immutable override proxySetterRole;

    /// @notice Withdrawer role
    bytes32 public immutable override withdrawerRole;

    /// @notice Auctioneer role
    bytes32 public immutable override auctioneerRole;

    /// @notice Collateral requirement in relation to the bid amount in basis
    /// points
    /// @dev The collateral requirement can range from 0% to values larger than
    /// 100%. This is because one can hypothesize cases where denying service
    /// by being slashed by the full bid amount is still profitable, in which
    /// case a collateral requirement that is larger than 100% would be
    /// justifiable.
    uint256 public override collateralInBasisPoints;

    /// @notice Protocol fee in relation to the bid amount in basis points
    /// @dev The protocol fee is not necessarily bounded by the bid amount,
    /// which means that this value is not necessarily bounded by 100%
    uint256 public override protocolFeeInBasisPoints;

    /// @notice Data feed proxy address for the collateral rate
    /// @dev The collateral is denominated in the native currency of the chain
    /// that OevAuctionHouse is deployed on. Bid amounts are specified and paid
    /// in the native currency of the chain that the dApp (from which OEV is
    /// being extracted from) is deployed on. This means that a common base is
    /// needed for the collateral rate and the native currency rates. For
    /// example, if the collateral rate proxy provides the ETH/USD rate, the
    /// native currency rate proxies should provide */USD rates.
    address public override collateralRateProxy;

    /// @notice Data feed proxy address for the native currency of the chain
    /// with the ID
    mapping(uint256 => address)
        public
        override chainIdToNativeCurrencyRateProxy;

    /// @notice Accumulated collateral funds slashed by auctioneers by
    /// contradicting fulfillments
    uint256 public override accumulatedSlashedCollateral;

    /// @notice Accumulated protocol fees charged by auctioneers by confirming
    /// fulfillments
    uint256 public override accumulatedProtocolFees;

    /// @notice Deposited funds of the bidder, excluding the amount that is
    /// currently locked up for awarded bids awaiting fulfillment confirmation
    mapping(address => uint256) public override bidderToBalance;

    /// @notice Earliest time that the bidder can execute the initiated
    /// withdrawal. A timestamp of zero means that there is no ongoing
    /// withdrawal.
    mapping(address => uint256)
        public
        override bidderToEarliestWithdrawalTimestamp;

    /// @notice Status, expiration timestamp, collateral amount and protocol
    /// fee amount of the bid with ID
    mapping(bytes32 => Bid) public override bids;

    uint256 private constant HUNDRED_PERCENT_IN_BASIS_POINTS = 100 * 100;

    uint256 private constant MAXIMUM_RATE_AGE = 1 days;

    /// @dev Reverts if the sender is not the contract manager
    modifier onlyManager() {
        if (msg.sender != manager) revert SenderIsNotTheManager();
        _;
    }

    /// @dev Reverts if the sender is not a proxy setter or the contract
    /// manager
    modifier onlyProxySetterOrManager() {
        if (
            !IAccessControlRegistry(accessControlRegistry).hasRole(
                proxySetterRole,
                msg.sender
            ) && msg.sender != manager
        ) revert SenderIsNotAProxySetterOrTheManager();
        _;
    }

    /// @dev Reverts if the sender is not a withdrawer or the contract manager
    modifier onlyWithdrawerOrManager() {
        if (
            !IAccessControlRegistry(accessControlRegistry).hasRole(
                withdrawerRole,
                msg.sender
            ) && msg.sender != manager
        ) revert SenderIsNotAWithdrawerOrTheManager();
        _;
    }

    /// @dev Reverts if the sender is not an auctioneer
    modifier onlyAuctioneer() {
        if (
            !IAccessControlRegistry(accessControlRegistry).hasRole(
                auctioneerRole,
                msg.sender
            )
        ) revert SenderIsNotAnAuctioneer();
        _;
    }

    /// @dev Reverts if the withdrawal parameters are not valid
    /// @param recipient Recipient address
    /// @param amount Amount
    modifier onlyValidWithdrawalParameters(
        address payable recipient,
        uint256 amount
    ) {
        if (recipient == address(0)) revert RecipientAddressIsZero();
        if (amount == 0) revert WithdrawalAmountIsZero();
        _;
    }

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _manager Manager address
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager
    )
        AccessControlRegistryAdminnedWithManager(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager
        )
    {
        proxySetterRole = _deriveRole(
            _deriveAdminRole(manager),
            PROXY_SETTER_ROLE_DESCRIPTION
        );
        withdrawerRole = _deriveRole(
            _deriveAdminRole(manager),
            WITHDRAWER_ROLE_DESCRIPTION
        );
        auctioneerRole = _deriveRole(
            _deriveAdminRole(manager),
            AUCTIONEER_ROLE_DESCRIPTION
        );
    }

    /// @notice Called by the manager to set the collateral requirement in
    /// basis points
    /// @dev The collateral requirement can range from 0% (0 in basis points)
    /// to values larger than 100% (10000 in basis points).
    /// The contract manager is recommended to tune this parameter to maximize
    /// the extracted OEV. The optimal value will be defined by bidder behavior
    /// and may change over time.
    /// In the absence of additional incentives (e.g., a reputation system that
    /// refers to confirmed fulfillments), a collateral requirement that is not
    /// larger than the protocol fee may result in fulfillments going
    /// unreported (as being slashed would not be more punitive than being
    /// charged the protocol fee).
    /// @param collateralInBasisPoints_ Collateral requirement in basis points
    function setCollateralInBasisPoints(
        uint256 collateralInBasisPoints_
    ) external override onlyManager {
        collateralInBasisPoints = collateralInBasisPoints_;
        emit SetCollateralInBasisPoints(collateralInBasisPoints_);
    }

    /// @notice Called by the manager to set the protocol fee in basis points
    /// @dev The protocol fee can range from 0% (0 in basis points) to values
    /// larger than 100% (10000 in basis points)
    /// @param protocolFeeInBasisPoints_ Protocol fee in basis points
    function setProtocolFeeInBasisPoints(
        uint256 protocolFeeInBasisPoints_
    ) external override onlyManager {
        protocolFeeInBasisPoints = protocolFeeInBasisPoints_;
        emit SetProtocolFeeInBasisPoints(protocolFeeInBasisPoints_);
    }

    /// @notice Sets collateral rate proxy
    /// @dev The data feed proxy contract is expected to implement the IProxy
    /// interface and the respective data feed to be active with at most a
    /// 1-day heartbeat interval. Only use trusted contracts (e.g., contracts
    /// deployed by API3's ProxyFactory) to avoid reentrancy risks.
    /// The collateral rate denomination must match the native curreny rate
    /// denomination, e.g., if the collateral rate is in the form of ETH/USD,
    /// the native currency rates should be in the form of */USD.
    /// @param collateralRateProxy_ Collateral rate proxy address
    function setCollateralRateProxy(
        address collateralRateProxy_
    ) external override onlyProxySetterOrManager {
        if (collateralRateProxy_ == address(0)) revert ProxyAddressIsZero();
        collateralRateProxy = collateralRateProxy_;
        emit SetCollateralRateProxy(collateralRateProxy_);
    }

    /// @notice Sets native currency rate proxy for the chain with ID
    /// @dev The data feed proxy contract is expected to implement the IProxy
    /// interface and the respective data feed to be active with at most a
    /// 1-day heartbeat interval. Only use trusted contracts (e.g., contracts
    /// deployed by API3's ProxyFactory) to avoid reentrancy risks.
    /// The collateral rate denomination must match the native curreny rate
    /// denomination, e.g., if the collateral rate is in the form of ETH/USD,
    /// the native currency rates should be in the form of */USD.
    /// @param chainId Chain ID
    /// @param nativeCurrencyRateProxy Native currency rate proxy address
    function setChainNativeCurrencyRateProxy(
        uint256 chainId,
        address nativeCurrencyRateProxy
    ) external override onlyProxySetterOrManager {
        if (chainId == 0) revert ChainIdIsZero();
        if (nativeCurrencyRateProxy == address(0)) revert ProxyAddressIsZero();
        chainIdToNativeCurrencyRateProxy[chainId] = nativeCurrencyRateProxy;
        emit SetChainNativeCurrencyRateProxy(chainId, nativeCurrencyRateProxy);
    }

    /// @notice Called by the contract manager to withdraw the accumulated
    /// collateral slashed by auctioneers by contradicting fulfillments
    /// @param recipient Recipient address
    /// @param amount Amount
    function withdrawAccumulatedSlashedCollateral(
        address payable recipient,
        uint256 amount
    )
        external
        override
        onlyWithdrawerOrManager
        onlyValidWithdrawalParameters(recipient, amount)
    {
        if (amount > accumulatedSlashedCollateral) revert InsufficientBalance();
        accumulatedSlashedCollateral -= amount;
        emit WithdrewAccumulatedSlashedCollateral(recipient, amount);
        sendValue(recipient, amount);
    }

    /// @notice Called by the contract manager to withdraw the accumulated
    /// protocol fees charged by auctioneers by confirming fulfillments
    /// @param recipient Recipient address
    /// @param amount Amount
    function withdrawAccumulatedProtocolFees(
        address payable recipient,
        uint256 amount
    )
        external
        override
        onlyWithdrawerOrManager
        onlyValidWithdrawalParameters(recipient, amount)
    {
        if (amount > accumulatedProtocolFees) revert InsufficientBalance();
        accumulatedProtocolFees -= amount;
        emit WithdrewAccumulatedProtocolFees(recipient, amount);
        sendValue(recipient, amount);
    }

    /// @notice Called to deposit funds for a bidder
    /// @param bidder Bidder address
    /// @return bidderBalance Bidder balance after the deposit
    function depositForBidder(
        address bidder
    ) public payable override returns (uint256 bidderBalance) {
        if (bidder == address(0)) revert BidderAddressIsZero();
        if (msg.value == 0) revert DepositAmountIsZero();
        bidderBalance = bidderToBalance[bidder] + msg.value;
        bidderToBalance[bidder] = bidderBalance;
        emit Deposited(bidder, msg.value, bidderBalance, msg.sender);
    }

    /// @notice Called by the bidder to deposit funds
    /// @return bidderBalance Bidder balance after the deposit
    function deposit()
        external
        payable
        override
        returns (uint256 bidderBalance)
    {
        bidderBalance = depositForBidder(msg.sender);
    }

    /// @notice Called by the bidder to initiate a withdrawal of their funds
    /// @dev A two-step withdrawal process is implemented to prevent the
    /// bidders from frontrunning bid awarding transactions with withdrawals to
    /// deny service
    /// @return earliestWithdrawalTimestamp Earliest time that the bidder can
    /// execute the initiated withdrawal
    function initiateWithdrawal()
        external
        override
        returns (uint256 earliestWithdrawalTimestamp)
    {
        if (bidderToEarliestWithdrawalTimestamp[msg.sender] != 0)
            revert BidderHasAlreadyInitiatedWithdrawal();
        earliestWithdrawalTimestamp =
            block.timestamp +
            WITHDRAWAL_WAITING_PERIOD;
        bidderToEarliestWithdrawalTimestamp[
            msg.sender
        ] = earliestWithdrawalTimestamp;
        emit InitiatedWithdrawal(msg.sender, earliestWithdrawalTimestamp);
    }

    /// @notice Called by the bidder to execute a withdrawal that they have
    /// initiated
    /// @param recipient Recipient address
    /// @param amount Amount
    function withdraw(
        address payable recipient,
        uint256 amount
    ) external override onlyValidWithdrawalParameters(recipient, amount) {
        uint256 balance = bidderToBalance[msg.sender];
        if (amount > balance) revert InsufficientBalance();
        uint256 earliestWithdrawalTimestamp = bidderToEarliestWithdrawalTimestamp[
                msg.sender
            ];
        if (earliestWithdrawalTimestamp == 0)
            revert SenderHasNotInitiatedWithdrawal();
        if (block.timestamp < earliestWithdrawalTimestamp)
            revert BidderCannotWithdrawYet();
        bidderToBalance[msg.sender] = balance - amount;
        bidderToEarliestWithdrawalTimestamp[msg.sender] = 0;
        emit Withdrew(msg.sender, recipient, amount);
        sendValue(recipient, amount);
    }

    /// @notice Called by the bidder to cancel a withdrawal that they have
    /// initiated
    function cancelWithdrawal() external override {
        if (bidderToEarliestWithdrawalTimestamp[msg.sender] == 0)
            revert SenderHasNotInitiatedWithdrawal();
        bidderToEarliestWithdrawalTimestamp[msg.sender] = 0;
        emit CanceledWithdrawal(msg.sender);
    }

    /// @notice Called to place a bid with an expiration timestamp. Searchers
    /// should use this over `placeBid()` if they expect the OEV opportunity to
    /// disappear at a specific time before the maximum bid lifetime.
    /// The searcher should determine maximum collateral and protocol fees that
    /// they will tolerate, and specify them in the arguments.
    /// Upon the awarding of the bid, the larger of the collateral amount and
    /// protocol fee amount will be locked. Upon confirmation or contradiction
    /// of the respective fulfillment, the locked amount will be released, and
    /// the protocol fee will be charged or the collateral amount will be
    /// slashed, respectively.
    /// @dev `bidTopic` is an arbitrary identifier of the bid type.
    /// `bidDetails` is an arbitrary description of the bid details. Refer to
    /// the documentation that the auctioneer provides for the bidders for how
    /// these parameters should be set.
    /// @param bidTopic Bid topic
    /// @param chainId Chain ID
    /// @param bidAmount Bid amount in the native currency of the chain with ID
    /// @param bidDetails Bid details
    /// @param maxCollateralAmount Maximum collateral amount in the currency of
    /// the chain that OevAuctionHouse is deployed on
    /// @param maxProtocolFeeAmount Maximum protocol fee amount in the currency
    /// of the chain that OevAuctionHouse is deployed on
    /// @param expirationTimestamp Expiration timestamp after which the bid
    /// cannot be awarded
    /// @return collateralAmount Collateral amount in the currency of the chain
    /// that OevAuctionHouse is deployed on
    /// @return protocolFeeAmount Protocol fee amount in the currency of the
    /// chain that OevAuctionHouse is deployed on
    function placeBidWithExpiration(
        bytes32 bidTopic,
        uint256 chainId,
        uint256 bidAmount,
        bytes calldata bidDetails,
        uint256 maxCollateralAmount,
        uint256 maxProtocolFeeAmount,
        uint32 expirationTimestamp
    )
        public
        override
        returns (uint104 collateralAmount, uint104 protocolFeeAmount)
    {
        if (chainId == 0) revert ChainIdIsZero();
        if (bidAmount == 0) revert BidAmountIsZero();
        uint256 bidDetailsLength = bidDetails.length;
        if (bidDetailsLength > MAXIMUM_BIDDER_DATA_LENGTH)
            revert MaximumBidderDataLengthIsExceeded();
        if (bidDetailsLength == 0) revert BidDetailsAreEmpty();
        if (block.timestamp + MAXIMUM_BID_LIFETIME < expirationTimestamp)
            revert BidLifetimeIsLongerThanMaximum();
        if (block.timestamp + MINIMUM_BID_LIFETIME > expirationTimestamp)
            revert BidLifetimeIsShorterThanMinimum();
        // The bid details should be specified to include a salt field to allow
        // bids that otherwise would have identical IDs
        bytes32 bidId = keccak256(
            abi.encodePacked(msg.sender, bidTopic, keccak256(bidDetails))
        );
        if (bids[bidId].status != BidStatus.None) revert BidIsAlreadyPlaced();
        (
            collateralAmount,
            protocolFeeAmount
        ) = getCurrentCollateralAndProtocolFeeAmounts(chainId, bidAmount);
        if (collateralAmount > maxCollateralAmount)
            revert MaxCollateralAmountIsExceeded();
        if (protocolFeeAmount > maxProtocolFeeAmount)
            revert MaxProtocolFeeAmountIsExceeded();
        bids[bidId] = Bid({
            status: BidStatus.Placed,
            expirationTimestamp: expirationTimestamp,
            collateralAmount: collateralAmount,
            protocolFeeAmount: protocolFeeAmount
        });
        emit PlacedBid(
            msg.sender,
            bidTopic,
            bidId,
            chainId,
            bidAmount,
            bidDetails,
            expirationTimestamp,
            collateralAmount,
            protocolFeeAmount
        );
    }

    /// @notice Called to place a bid with the longest possible lifetime.
    /// The searcher should determine maximum collateral and protocol fees that
    /// they will tolerate, and specify them in the arguments.
    /// Upon the awarding of the bid, the larger of the collateral amount and
    /// protocol fee amount will be locked. Upon confirmation or contradiction
    /// of the respective fulfillment, the locked amount will be released, and
    /// the protocol fee will be charged or the collateral amount will be
    /// slashed, respectively.
    /// @param bidTopic Bid topic
    /// @param chainId Chain ID
    /// @param bidAmount Bid amount in the native currency of the chain with ID
    /// @param bidDetails Bid details
    /// @param maxCollateralAmount Maximum collateral amount in the currency of
    /// the chain that OevAuctionHouse is deployed on
    /// @param maxProtocolFeeAmount Maximum protocol fee amount in the currency
    /// of the chain that OevAuctionHouse is deployed on
    /// @return expirationTimestamp Expiration timestamp after which the bid
    /// cannot be awarded
    /// @return collateralAmount Collateral amount in the currency of the chain
    /// that OevAuctionHouse is deployed on
    /// @return protocolFeeAmount Protocol fee amount in the currency of the
    /// chain that OevAuctionHouse is deployed on
    function placeBid(
        bytes32 bidTopic,
        uint256 chainId,
        uint256 bidAmount,
        bytes calldata bidDetails,
        uint256 maxCollateralAmount,
        uint256 maxProtocolFeeAmount
    )
        external
        override
        returns (
            uint32 expirationTimestamp,
            uint104 collateralAmount,
            uint104 protocolFeeAmount
        )
    {
        expirationTimestamp = uint32(block.timestamp + MAXIMUM_BID_LIFETIME);
        (collateralAmount, protocolFeeAmount) = placeBidWithExpiration(
            bidTopic,
            chainId,
            bidAmount,
            bidDetails,
            maxCollateralAmount,
            maxProtocolFeeAmount,
            expirationTimestamp
        );
    }

    /// @notice Called to update the bid expiration timestamp to a specific
    /// value to expedite its expiration
    /// @param bidTopic Bid topic
    /// @param bidDetailsHash Bid details hash
    /// @param expirationTimestamp Expiration timestamp after which the bid
    /// cannot be awarded
    function expediteBidExpiration(
        bytes32 bidTopic,
        bytes32 bidDetailsHash,
        uint32 expirationTimestamp
    ) public override {
        bytes32 bidId = keccak256(
            abi.encodePacked(msg.sender, bidTopic, bidDetailsHash)
        );
        Bid storage bid = bids[bidId];
        if (bid.status != BidStatus.Placed) revert BidIsNotAwaitingAward();
        uint32 bidExpirationTimestamp = bid.expirationTimestamp;
        if (block.timestamp >= bidExpirationTimestamp) revert BidHasExpired();
        if (expirationTimestamp >= bidExpirationTimestamp)
            revert TimestampDoesNotExpediteExpiration();
        if (block.timestamp + MINIMUM_BID_LIFETIME > expirationTimestamp)
            revert BidLifetimeIsShorterThanMinimum();
        bid.expirationTimestamp = expirationTimestamp;
        emit ExpeditedBidExpiration(
            msg.sender,
            bidTopic,
            bidId,
            expirationTimestamp
        );
    }

    /// @notice Called to decrease the bid expiration timestamp as much as
    /// possible to maximally expedite its expiration
    /// @param bidTopic Bid topic
    /// @param bidDetailsHash Bid details hash
    /// @return expirationTimestamp Expiration timestamp after which the bid
    /// cannot be awarded
    function expediteBidExpirationMaximally(
        bytes32 bidTopic,
        bytes32 bidDetailsHash
    ) external override returns (uint32 expirationTimestamp) {
        expirationTimestamp = uint32(block.timestamp + MINIMUM_BID_LIFETIME);
        expediteBidExpiration(bidTopic, bidDetailsHash, expirationTimestamp);
    }

    /// @notice Called by an auctioneer to award the bid
    /// @dev `awardDetails` is an arbitrary description of how to claim the
    /// award. Refer to the documentation that the auctioneer provides for the
    /// bidders for how to use it.
    /// The bidder receiving `awardDetails` is typically time-critical.
    /// However, the bid awarding transaction may not always be confirmed
    /// immediately. To avoid unjust collateral lockups or slashings,
    /// auctioneers should use an appropriate `awardExpirationTimestamp` that
    /// will cause such transactions to revert.
    /// @param bidder Bidder address
    /// @param bidTopic Bid topic
    /// @param bidDetailsHash Bid details hash
    /// @param awardDetails Award details
    /// @param awardExpirationTimestamp Award expiration timestamp
    /// @return bidderBalance Bidder balance after the lockup
    function awardBid(
        address bidder,
        bytes32 bidTopic,
        bytes32 bidDetailsHash,
        bytes calldata awardDetails,
        uint256 awardExpirationTimestamp
    ) external override onlyAuctioneer returns (uint256 bidderBalance) {
        uint256 awardDetailsLength = awardDetails.length;
        if (awardDetailsLength > MAXIMUM_AUCTIONEER_DATA_LENGTH)
            revert MaximumAuctioneerDataLengthIsExceeded();
        if (awardDetailsLength == 0) revert AwardDetailsAreEmpty();
        if (block.timestamp >= awardExpirationTimestamp)
            revert AwardHasExpired();
        bytes32 bidId = keccak256(
            abi.encodePacked(bidder, bidTopic, bidDetailsHash)
        );
        Bid storage bid = bids[bidId];
        if (bid.status != BidStatus.Placed) revert BidIsNotAwaitingAward();
        if (block.timestamp >= bid.expirationTimestamp) revert BidHasExpired();
        bid.status = BidStatus.Awarded;
        // Refresh the expiration timestamp for the fulfillment report
        bid.expirationTimestamp = uint32(
            block.timestamp + FULFILLMENT_REPORTING_PERIOD
        );
        bidderBalance = bidderToBalance[bidder];
        uint256 lockedAmount = bid.collateralAmount > bid.protocolFeeAmount
            ? bid.collateralAmount
            : bid.protocolFeeAmount;
        if (bidderBalance < lockedAmount)
            revert BidderBalanceIsLowerThanTheLockedAmount();
        bidderBalance -= lockedAmount;
        bidderToBalance[bidder] = bidderBalance;
        emit AwardedBid(bidder, bidTopic, bidId, awardDetails, bidderBalance);
    }

    /// @notice Called by the owner of the awarded bid to report its
    /// fulfillment
    /// @dev `fulfillmentDetails` is an arbitrary description of how the
    /// fulfillment is to be verified. Refer to the documentation that the
    /// auctioneer provides for the bidders for how this parameter should be
    /// set.
    /// @param bidTopic Bid topic
    /// @param bidDetailsHash Bid details hash
    /// @param fulfillmentDetails Fulfillment details
    function reportFulfillment(
        bytes32 bidTopic,
        bytes32 bidDetailsHash,
        bytes calldata fulfillmentDetails
    ) external override {
        uint256 fulfillmentDetailsLength = fulfillmentDetails.length;
        if (fulfillmentDetailsLength > MAXIMUM_BIDDER_DATA_LENGTH)
            revert MaximumBidderDataLengthIsExceeded();
        if (fulfillmentDetailsLength == 0) revert FulfillmentDetailsAreEmpty();
        bytes32 bidId = keccak256(
            abi.encodePacked(msg.sender, bidTopic, bidDetailsHash)
        );
        Bid storage bid = bids[bidId];
        if (bid.status != BidStatus.Awarded)
            revert BidIsNotAwaitingFulfillmentReport();
        if (block.timestamp >= bid.expirationTimestamp) revert BidHasExpired();
        bid.status = BidStatus.FulfillmentReported;
        emit ReportedFulfillment(
            msg.sender,
            bidTopic,
            bidId,
            fulfillmentDetails
        );
    }

    /// @notice Called by an auctioneer to confirm a fulfillment, and release
    /// the collateral and charge the protocol fee
    /// @dev A fulfillment does not have to be reported to be confirmed. A bid
    /// can be confirmed to be fulfilled even after it has expired.
    /// @param bidder Bidder address
    /// @param bidTopic Bid topic
    /// @param bidDetailsHash Bid details hash
    /// @return bidderBalance Bidder balance after the collateral release
    /// @return accumulatedProtocolFees_ Accumulated protocol fees
    function confirmFulfillment(
        address bidder,
        bytes32 bidTopic,
        bytes32 bidDetailsHash
    )
        external
        override
        onlyAuctioneer
        returns (uint256 bidderBalance, uint256 accumulatedProtocolFees_)
    {
        bytes32 bidId = keccak256(
            abi.encodePacked(bidder, bidTopic, bidDetailsHash)
        );
        Bid storage bid = bids[bidId];
        if (
            bid.status != BidStatus.FulfillmentReported &&
            bid.status != BidStatus.Awarded
        ) revert BidFulfillmentCannotBeConfirmed();
        bid.status = BidStatus.FulfillmentConfirmed;
        bidderBalance =
            bidderToBalance[bidder] +
            (
                bid.collateralAmount > bid.protocolFeeAmount
                    ? bid.collateralAmount
                    : bid.protocolFeeAmount
            ) -
            bid.protocolFeeAmount;
        bidderToBalance[bidder] = bidderBalance;
        accumulatedProtocolFees_ =
            accumulatedProtocolFees +
            bid.protocolFeeAmount;
        accumulatedProtocolFees = accumulatedProtocolFees_;
        emit ConfirmedFulfillment(
            bidder,
            bidTopic,
            bidId,
            bidderBalance,
            accumulatedProtocolFees_
        );
    }

    /// @notice Called by an auctioneer to contradict a fulfillment, and slash
    /// the collateral and release the protocol fee
    /// @dev Fulfillments that have not been reported can only be contradicted
    /// after the reporting period is over
    /// @param bidder Bidder address
    /// @param bidTopic Bid topic
    /// @param bidDetailsHash Bid details hash
    /// @return bidderBalance Bidder balance after the protocol fee release
    /// @return accumulatedSlashedCollateral_ Accumulated slashed collateral
    function contradictFulfillment(
        address bidder,
        bytes32 bidTopic,
        bytes32 bidDetailsHash
    )
        external
        override
        onlyAuctioneer
        returns (uint256 bidderBalance, uint256 accumulatedSlashedCollateral_)
    {
        bytes32 bidId = keccak256(
            abi.encodePacked(bidder, bidTopic, bidDetailsHash)
        );
        Bid storage bid = bids[bidId];
        BidStatus bidStatus = bid.status;
        if (
            bidStatus != BidStatus.FulfillmentReported &&
            !(bidStatus == BidStatus.Awarded &&
                block.timestamp >= bid.expirationTimestamp)
        ) revert BidFulfillmentCannotBeContradicted();
        bid.status = BidStatus.FulfillmentContradicted;
        bidderBalance =
            bidderToBalance[bidder] +
            (
                bid.collateralAmount > bid.protocolFeeAmount
                    ? bid.collateralAmount
                    : bid.protocolFeeAmount
            ) -
            bid.collateralAmount;
        bidderToBalance[bidder] = bidderBalance;
        accumulatedSlashedCollateral_ =
            accumulatedSlashedCollateral +
            bid.collateralAmount;
        accumulatedSlashedCollateral = accumulatedSlashedCollateral_;
        emit ContradictedFulfillment(
            bidder,
            bidTopic,
            bidId,
            bidderBalance,
            accumulatedSlashedCollateral_
        );
    }

    /// @notice Gets the collateral amount and the protocol fee amount for a
    /// bid with the chain ID and amount parameters based on the current rates,
    /// collateral requirement and protocol fee
    /// @param chainId Chain ID
    /// @param bidAmount Bid amount in the native currency of the chain with ID
    /// @return collateralAmount Collateral amount in the currency of the chain
    /// that OevAuctionHouse is deployed on
    /// @return protocolFeeAmount Protocol fee amount in the currency of the
    /// chain that OevAuctionHouse is deployed on
    function getCurrentCollateralAndProtocolFeeAmounts(
        uint256 chainId,
        uint256 bidAmount
    )
        public
        view
        override
        returns (uint104 collateralAmount, uint104 protocolFeeAmount)
    {
        if (collateralInBasisPoints == 0 && protocolFeeInBasisPoints == 0) {
            return (0, 0);
        }
        (int224 collateralRateValue, uint32 collateralRateTimestamp) = IProxy(
            collateralRateProxy
        ).read();
        if (collateralRateValue <= 0) revert CollateralRateIsNotPositive();
        if (block.timestamp >= collateralRateTimestamp + MAXIMUM_RATE_AGE)
            revert CollateralRateIsStale();
        (
            int224 nativeCurrencyRateValue,
            uint32 nativeCurrencyRateTimestamp
        ) = IProxy(chainIdToNativeCurrencyRateProxy[chainId]).read();
        if (nativeCurrencyRateValue <= 0)
            revert NativeCurrencyRateIsNotPositive();
        if (block.timestamp >= nativeCurrencyRateTimestamp + MAXIMUM_RATE_AGE)
            revert NativeCurrencyRateIsStale();
        collateralAmount = safeCastToUint104(
            (bidAmount *
                uint256(int256(nativeCurrencyRateValue)) *
                collateralInBasisPoints) /
                uint256(int256(collateralRateValue)) /
                HUNDRED_PERCENT_IN_BASIS_POINTS
        );
        protocolFeeAmount = safeCastToUint104(
            (bidAmount *
                uint256(int256(nativeCurrencyRateValue)) *
                protocolFeeInBasisPoints) /
                uint256(int256(collateralRateValue)) /
                HUNDRED_PERCENT_IN_BASIS_POINTS
        );
    }

    /// @notice Sends value to recipient
    /// @dev In the contexts that this function is used, the balance will
    /// always be sufficient and thus is not checked
    /// @param recipient Recipient address
    /// @param amount Amount to be sent
    function sendValue(address payable recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer unsuccessful");
    }

    /// @notice Safe-casts the value from uint256 to uint104
    /// @param valueInUint256 Value in uint256
    /// @return valueInUint104 Value safe-cast to uint256
    function safeCastToUint104(
        uint256 valueInUint256
    ) private pure returns (uint104 valueInUint104) {
        require(
            valueInUint256 <= type(uint104).max,
            "Value does not fit in uint104"
        );
        valueInUint104 = uint104(valueInUint256);
    }
}
