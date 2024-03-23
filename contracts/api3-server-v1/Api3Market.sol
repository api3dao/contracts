// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../access/HashRegistry.sol";
import "../utils/ExtendedSelfMulticall.sol";
import "./interfaces/IApi3Market.sol";
import "./AirseekerRegistry.sol";
import "../vendor/@openzeppelin/contracts@4.9.5/utils/math/SafeCast.sol";
import "../vendor/@openzeppelin/contracts@4.9.5/utils/cryptography/MerkleProof.sol";
import "./interfaces/IApi3ServerV1.sol";
import "./proxies/interfaces/IProxyFactory.sol";

/// @title The contract that API3 users interact with using the API3 Market
/// frontend to purchase data feed subscriptions
/// @notice API3 aims to streamline and protocolize its integration processes
/// through the API3 Market (https://market.api3.org), which is a data feed
/// subscription marketplace. The Api3Market contract is the on-chain portion
/// of this system.
/// Api3Market enables API3 to predetermine the decisions related to its data
/// feed services (such as the curation of data feed sources or subscription
/// prices) and publish them on-chain. This streamlines the intergation flow,
/// as it allows the users to initiate subscriptions immediately, without
/// requiring any two-way communication with API3. Furthermore, this removes
/// the need for API3 to have agents operating in the meatspace gathering order
/// details, quoting prices and reviewing payments, and allows all such
/// operations to be cryptographically secured with a multi-party scheme in an
/// end-to-end manner.
/// @dev The user is strongly recommended to use the API3 Market frontend while
/// interacting with this contract, mostly because doing so successfully
/// requires some amount of knowledge of other API3 contracts. Specifically,
/// Api3Market requires the data feed for which the subscription is being
/// purchased to be "readied", the correct Merkle proofs to be provided, and
/// enough payment to be made. The API3 Market frontend will fetch the
/// appropriate Merkle proofs, create a multicall transaction that will ready
/// the data feed before making the call to buy the subscription, and compute
/// the amount to be sent that will barely allow the subscription to be
/// purchased. For most users, building such a transaction themselves would be
/// impractical.
contract Api3Market is HashRegistry, ExtendedSelfMulticall, IApi3Market {
    enum UpdateParametersComparisonResult {
        EqualToQueued,
        BetterThanQueued,
        WorseThanQueued
    }

    // The update parameters for each subscription is kept in a hash map rather
    // than in full form as an optimization. Refer to AirseekerRegistry for a
    // similar scheme.
    // The subscription queues are kept as linked lists, for which each
    // subscription has a next subscription ID field.
    struct Subscription {
        bytes32 updateParametersHash;
        uint32 endTimestamp;
        uint224 dailyPrice;
        bytes32 nextSubscriptionId;
    }

    /// @notice dAPI management Merkle root hash type
    /// @dev "Hash type" is what HashRegistry uses to address hashes used for
    /// different purposes
    bytes32 public constant override DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE =
        keccak256(abi.encodePacked("dAPI management Merkle root"));

    /// @notice dAPI pricing Merkle root hash type
    bytes32 public constant override DAPI_PRICING_MERKLE_ROOT_HASH_TYPE =
        keccak256(abi.encodePacked("dAPI pricing Merkle root"));

    /// @notice Signed API URL Merkle root hash type
    bytes32 public constant override SIGNED_API_URL_MERKLE_ROOT_HASH_TYPE =
        keccak256(abi.encodePacked("Signed API URL Merkle root"));

    /// @notice Maximum dAPI update age. This contract cannot be used to set a
    /// dAPI name to a data feed that has not been updated in the last
    /// `MAXIMUM_DAPI_UPDATE_AGE`.
    uint256 public constant override MAXIMUM_DAPI_UPDATE_AGE = 1 days;

    /// @notice Api3ServerV1 contract address
    address public immutable override api3ServerV1;

    /// @notice ProxyFactory contract address
    address public immutable override proxyFactory;

    /// @notice AirseekerRegistry contract address
    address public immutable override airseekerRegistry;

    /// @notice Maximum subscription queue length for a dAPI
    /// @dev Some functionality in this contract requires to iterate through
    /// the entire subscription queue for a dAPI, and the queue length is
    /// limited to prevent this process from being bloated. Considering that
    /// each item in the subscription queue has unique update parameters, the
    /// length of the subscription queue is also limited by the number of
    /// unique update parameters offered in the dAPI pricing Merkle tree. For
    /// reference, at the time this contract is implemented, the API3 Market
    /// offers 4 update parameter options.
    uint256 public immutable override maximumSubscriptionQueueLength;

    /// @notice Subscriptions indexed by their IDs
    mapping(bytes32 => Subscription) public override subscriptions;

    /// @notice dAPI name to current subscription ID, which denotes the start
    /// of the subscription queue for the dAPI
    mapping(bytes32 => bytes32) public override dapiNameToCurrentSubscriptionId;

    // Update parameters hash map
    mapping(bytes32 => bytes) private updateParametersHashToValue;

    // Length of abi.encode(address, bytes32)
    uint256 private constant DATA_FEED_DETAILS_LENGTH_FOR_SINGLE_BEACON =
        32 + 32;

    // Length of abi.encode(uint256, int224, uint256)
    uint256 private constant UPDATE_PARAMETERS_LENGTH = 32 + 32 + 32;

    bytes32 private constant API3MARKET_SIGNATURE_DELEGATION_HASH_TYPE =
        keccak256(abi.encodePacked("Api3Market signature delegation"));

    /// @dev Api3Market deploys its own AirseekerRegistry deterministically.
    /// This implies that Api3Market-specific Airseekers should be operated by
    /// pointing at this contract.
    /// The maximum subscription queue length should be large enough to not
    /// obstruct subscription purchases under usual conditions, and small
    /// enough to keep the queue at an iterable size. For example, if the
    /// number of unique update parameters in the dAPI pricing Merkle trees
    /// that are being used is around 5, a maximum subscription queue length of
    /// 10 would be acceptable for a typical chain.
    /// @param owner_ Owner address
    /// @param proxyFactory_ ProxyFactory contract address
    /// @param maximumSubscriptionQueueLength_ Maximum subscription queue
    /// length
    constructor(
        address owner_,
        address proxyFactory_,
        uint256 maximumSubscriptionQueueLength_
    ) HashRegistry(owner_) {
        require(
            maximumSubscriptionQueueLength_ != 0,
            "Maximum queue length zero"
        );
        proxyFactory = proxyFactory_;
        address api3ServerV1_ = IProxyFactory(proxyFactory_).api3ServerV1();
        api3ServerV1 = api3ServerV1_;
        airseekerRegistry = address(
            new AirseekerRegistry{salt: bytes32(0)}(
                address(this),
                api3ServerV1_
            )
        );
        maximumSubscriptionQueueLength = maximumSubscriptionQueueLength_;
    }

    /// @notice Returns the owner address
    /// @return Owner address
    function owner()
        public
        view
        override(HashRegistry, IOwnable)
        returns (address)
    {
        return super.owner();
    }

    /// @notice Overriden to be disabled
    function renounceOwnership() public pure override(HashRegistry, IOwnable) {
        revert("Ownership cannot be renounced");
    }

    /// @notice Overriden to be disabled
    function transferOwnership(
        address
    ) public pure override(HashRegistry, IOwnable) {
        revert("Ownership cannot be transferred");
    }

    /// @notice Buys subscription and updates the current subscription ID if
    /// necessary. The user is recommended to interact with this contract over
    /// the API3 Market frontend due to its complexity.
    /// @dev The data feed that the dAPI name will be set to after this
    /// function is called must be readied (see `validateDataFeedReadiness()`)
    /// before calling this function.
    /// Enough funds must be sent to put the sponsor wallet balance over its
    /// expected amount after the subscription is bought. Since sponsor wallets
    /// send data feed update transactions, it is not possible to determine
    /// what their balance will be at the time sent transactions are confirmed.
    /// To avoid transactions being reverted as a result of this, consider
    /// sending some extra.
    /// @param dapiName dAPI name
    /// @param dataFeedId Data feed ID
    /// @param sponsorWallet Sponsor wallet address
    /// @param updateParameters Update parameters
    /// @param duration Subscription duration
    /// @param price Subscription price
    /// @param dapiManagementAndDapiPricingMerkleData ABI-encoded dAPI
    /// management and dAPI pricing Merkle roots and proofs
    /// @return subscriptionId Subscription ID
    function buySubscription(
        bytes32 dapiName,
        bytes32 dataFeedId,
        address payable sponsorWallet,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price,
        bytes calldata dapiManagementAndDapiPricingMerkleData
    ) public payable override returns (bytes32 subscriptionId) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        require(sponsorWallet != address(0), "Sponsor wallet address zero");
        verifyDapiManagementAndDapiPricingMerkleProofs(
            dapiName,
            dataFeedId,
            sponsorWallet,
            updateParameters,
            duration,
            price,
            dapiManagementAndDapiPricingMerkleData
        );
        subscriptionId = addSubscriptionToQueue(
            dapiName,
            dataFeedId,
            updateParameters,
            duration,
            price
        );
        require(
            sponsorWallet.balance + msg.value >=
                computeExpectedSponsorWalletBalance(dapiName),
            "Insufficient payment"
        );
        emit BoughtSubscription(
            dapiName,
            subscriptionId,
            dataFeedId,
            sponsorWallet,
            updateParameters,
            duration,
            price,
            msg.value
        );
        if (msg.value > 0) {
            (bool success, ) = sponsorWallet.call{value: msg.value}("");
            require(success, "Transfer unsuccessful");
        }
    }

    /// @notice Called by the owner to cancel all subscriptions for a dAPI
    /// that needs to be decommissioned urgently
    /// @dev The root of a new dAPI pricing Merkle tree that excludes the dAPI
    /// should be registered before canceling the subscriptions. Otherwise,
    /// anyone can immediately buy the subscriptions again.
    /// @param dapiName dAPI name
    function cancelSubscriptions(bytes32 dapiName) external override onlyOwner {
        require(
            dapiNameToCurrentSubscriptionId[dapiName] != bytes32(0),
            "Subscription queue empty"
        );
        dapiNameToCurrentSubscriptionId[dapiName] = bytes32(0);
        AirseekerRegistry(airseekerRegistry).setDapiNameToBeDeactivated(
            dapiName
        );
        emit CanceledSubscriptions(dapiName);
    }

    /// @notice If the current subscription has ended, updates it with the one
    /// that will end next
    /// @dev The fact that there is a current subscription that has ended would
    /// mean that API3 is providing a service that was not paid for. Therefore,
    /// API3 should poll this function for all active dAPI names and call it
    /// whenever it is not going to revert to downgrade the specs.
    /// @param dapiName dAPI name
    function updateCurrentSubscriptionId(bytes32 dapiName) public override {
        bytes32 currentSubscriptionId = dapiNameToCurrentSubscriptionId[
            dapiName
        ];
        require(
            currentSubscriptionId != bytes32(0),
            "Subscription queue empty"
        );
        require(
            subscriptions[currentSubscriptionId].endTimestamp <=
                block.timestamp,
            "Current subscription not ended"
        );
        updateEndedCurrentSubscriptionId(dapiName, currentSubscriptionId);
    }

    /// @notice Updates the dAPI name to match the respective Merkle leaf
    /// @dev Buying a dAPI subscription always updates the dAPI name if
    /// necessary. However, API3 may also publish new Merkle roots between
    /// subscription purchases, in which case API3 should call this function to
    /// bring the chain state up to date. Therefore, API3 should poll this
    /// function for all active dAPI names and call it whenever it will not
    /// revert.
    /// Similar to `buySubscription()`, this function requires the data feed
    /// that the dAPI will be pointed to to be readied.
    /// This function is allowed to be called even when the respective dAPI is
    /// not active, which means that a dAPI name being set does not imply that
    /// the respective data feed is in service. Users should only use dAPIs for
    /// which there is an active subscription with update parameters that
    /// satisfy their needs.
    /// @param dapiName dAPI name
    /// @param dataFeedId Data feed ID
    /// @param sponsorWallet Sponsor wallet address
    /// @param dapiManagementMerkleData ABI-encoded dAPI management Merkle root
    /// and proof
    function updateDapiName(
        bytes32 dapiName,
        bytes32 dataFeedId,
        address sponsorWallet,
        bytes calldata dapiManagementMerkleData
    ) external override {
        if (dataFeedId != bytes32(0)) {
            require(sponsorWallet != address(0), "Sponsor wallet address zero");
        } else {
            require(
                sponsorWallet == address(0),
                "Sponsor wallet address not zero"
            );
        }
        verifyDapiManagementMerkleProof(
            dapiName,
            dataFeedId,
            sponsorWallet,
            dapiManagementMerkleData
        );
        bytes32 currentDataFeedId = IApi3ServerV1(api3ServerV1)
            .dapiNameHashToDataFeedId(keccak256(abi.encodePacked(dapiName)));
        require(currentDataFeedId != dataFeedId, "Does not update dAPI name");
        if (dataFeedId != bytes32(0)) {
            validateDataFeedReadiness(dataFeedId);
        }
        IApi3ServerV1(api3ServerV1).setDapiName(dapiName, dataFeedId);
    }

    /// @notice Updates the signed API URL of the Airnode to match the
    /// respective Merkle leaf
    /// @dev Unlike the dAPI management and pricing Merkle leaves, the signed
    /// API URL Merkle leaves are not registered by the users as a part of
    /// subscription purchase transactions. API3 should poll this function for
    /// all Airnodes that are used in active dAPIs and call it whenever it will
    /// not revert.
    /// @param airnode Airnode address
    /// @param signedApiUrl Signed API URL
    /// @param signedApiUrlMerkleData ABI-encoded signed API URL Merkle root
    /// and proof
    function updateSignedApiUrl(
        address airnode,
        string calldata signedApiUrl,
        bytes calldata signedApiUrlMerkleData
    ) external override {
        verifySignedApiUrlMerkleProof(
            airnode,
            signedApiUrl,
            signedApiUrlMerkleData
        );
        require(
            keccak256(abi.encodePacked(signedApiUrl)) !=
                keccak256(
                    abi.encodePacked(
                        AirseekerRegistry(airseekerRegistry)
                            .airnodeToSignedApiUrl(airnode)
                    )
                ),
            "Does not update signed API URL"
        );
        AirseekerRegistry(airseekerRegistry).setSignedApiUrl(
            airnode,
            signedApiUrl
        );
    }

    /// @notice Multi-calls this contract, followed by a call with value to buy
    /// the subscription
    /// @dev This function is for the API3 Market frontend to call
    /// `eth_estimateGas` on a single transaction that readies a data feed and
    /// buys the respective subscription
    /// @param multicallData Array of calldata of batched calls
    /// @param dapiName dAPI name
    /// @param dataFeedId Data feed ID
    /// @param sponsorWallet Sponsor wallet address
    /// @param updateParameters Update parameters
    /// @param duration Subscription duration
    /// @param price Subscription price
    /// @param dapiManagementAndDapiPricingMerkleData ABI-encoded dAPI
    /// management and dAPI pricing Merkle roots and proofs
    /// @return returndata Array of returndata of batched calls
    /// @return subscriptionId Subscription ID
    function multicallAndBuySubscription(
        bytes[] calldata multicallData,
        bytes32 dapiName,
        bytes32 dataFeedId,
        address payable sponsorWallet,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price,
        bytes calldata dapiManagementAndDapiPricingMerkleData
    )
        external
        payable
        override
        returns (bytes[] memory returndata, bytes32 subscriptionId)
    {
        returndata = this.multicall(multicallData);
        subscriptionId = buySubscription(
            dapiName,
            dataFeedId,
            sponsorWallet,
            updateParameters,
            duration,
            price,
            dapiManagementAndDapiPricingMerkleData
        );
    }

    /// @notice Multi-calls this contract in a way that the transaction does
    /// not revert if any of the batched calls reverts, followed by a call with
    /// value to buy the subscription
    /// @dev This function is for the API3 Market frontend to send a single
    /// transaction that readies a data feed and buys the respective
    /// subscription. `tryMulticall()` is preferred in the purchase transaction
    /// because the readying calls may revert due to race conditions.
    /// @param tryMulticallData Array of calldata of batched calls
    /// @param dapiName dAPI name
    /// @param dataFeedId Data feed ID
    /// @param sponsorWallet Sponsor wallet address
    /// @param updateParameters Update parameters
    /// @param duration Subscription duration
    /// @param price Subscription price
    /// @param dapiManagementAndDapiPricingMerkleData ABI-encoded dAPI
    /// management and dAPI pricing Merkle roots and proofs
    /// @return successes Array of success conditions of batched calls
    /// @return returndata Array of returndata of batched calls
    /// @return subscriptionId Subscription ID
    function tryMulticallAndBuySubscription(
        bytes[] calldata tryMulticallData,
        bytes32 dapiName,
        bytes32 dataFeedId,
        address payable sponsorWallet,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price,
        bytes calldata dapiManagementAndDapiPricingMerkleData
    )
        external
        payable
        override
        returns (
            bool[] memory successes,
            bytes[] memory returndata,
            bytes32 subscriptionId
        )
    {
        (successes, returndata) = this.tryMulticall(tryMulticallData);
        subscriptionId = buySubscription(
            dapiName,
            dataFeedId,
            sponsorWallet,
            updateParameters,
            duration,
            price,
            dapiManagementAndDapiPricingMerkleData
        );
    }

    /// @notice Calls Api3ServerV1 to update the Beacon using data signed by
    /// the Airnode
    /// @dev The user is intended to make a multicall transaction through the
    /// API3 Market frontend to satisfy the required conditions to be able to
    /// buy a subscription and buy the subscription in a single transaction.
    /// The functions to which external calls must be made to to satisfy said
    /// conditions (such as this one) are added to this contract so that they
    /// can be multi-called by the user.
    /// @param airnode Airnode address
    /// @param templateId Template ID
    /// @param timestamp Signature timestamp
    /// @param data Update data (an `int256` encoded in contract ABI)
    /// @param signature Template ID, timestamp and the update data signed by
    /// the Airnode
    /// @return beaconId Updated Beacon ID
    function updateBeaconWithSignedData(
        address airnode,
        bytes32 templateId,
        uint256 timestamp,
        bytes calldata data,
        bytes calldata signature
    ) external override returns (bytes32 beaconId) {
        return
            IApi3ServerV1(api3ServerV1).updateBeaconWithSignedData(
                airnode,
                templateId,
                timestamp,
                data,
                signature
            );
    }

    /// @notice Calls Api3ServerV1 to update the Beacon set using the current
    /// values of its Beacons
    /// @param beaconIds Beacon IDs
    /// @return beaconSetId Updated Beacon set ID
    function updateBeaconSetWithBeacons(
        bytes32[] calldata beaconIds
    ) external override returns (bytes32 beaconSetId) {
        return
            IApi3ServerV1(api3ServerV1).updateBeaconSetWithBeacons(beaconIds);
    }

    /// @notice Calls ProxyFactory to deterministically deploy the dAPI proxy
    /// @dev It is recommended for the users to read data feeds through proxies
    /// deployed by ProxyFactory, rather than calling Api3ServerV1 directly.
    /// Even though proxy deployment is not a condition for purchasing
    /// subscriptions, the interface is implemented here to allow the user to
    /// purchase a dAPI subscription and deploy the respective proxy in the
    /// same transaction with a multicall.
    /// @param dapiName dAPI name
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function deployDapiProxy(
        bytes32 dapiName,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        proxyAddress = IProxyFactory(proxyFactory).deployDapiProxy(
            dapiName,
            metadata
        );
    }

    /// @notice Calls ProxyFactory to deterministically deploy the dAPI proxy
    /// with OEV support
    /// @param dapiName dAPI name
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function deployDapiProxyWithOev(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        proxyAddress = IProxyFactory(proxyFactory).deployDapiProxyWithOev(
            dapiName,
            oevBeneficiary,
            metadata
        );
    }

    /// @notice Calls AirseekerRegistry to register the data feed
    /// @param dataFeedDetails Data feed details
    /// @return dataFeedId Data feed ID
    function registerDataFeed(
        bytes calldata dataFeedDetails
    ) external override returns (bytes32 dataFeedId) {
        dataFeedId = AirseekerRegistry(airseekerRegistry).registerDataFeed(
            dataFeedDetails
        );
    }

    /// @notice Computes the expected sponsor wallet balance based on the
    /// current subscription queue
    /// @dev API3 estimates the transaction fee cost of subscriptions, and
    /// prices them accordingly. The subscription fees paid for a dAPI are sent
    /// to the respective sponsor wallet, which will send the update
    /// transactions. In the case that a subscription is overpriced, the extra
    /// funds are automatically rolled over as a discount to the next
    /// subscription bought for the same dAPI. In the case that a subscription
    /// is underpriced, there is a risk of the sponsor wallet running out of
    /// funds, resulting in the subscription specs to not be met. To avoid
    /// this, API3 should poll this function for all active dAPI names, check
    /// the respective sponsor wallet balances, and top up the sponsor wallets
    /// as necessary. The conditions that result in the underpricing will most
    /// likely require an updated dAPI pricing Merkle root to be published.
    /// @param dapiName dAPI name
    /// @return expectedSponsorWalletBalance Expected sponsor wallet balance
    function computeExpectedSponsorWalletBalance(
        bytes32 dapiName
    ) public view override returns (uint256 expectedSponsorWalletBalance) {
        uint32 startTimestamp = SafeCast.toUint32(block.timestamp);
        Subscription storage queuedSubscription;
        for (
            bytes32 queuedSubscriptionId = dapiNameToCurrentSubscriptionId[
                dapiName
            ];
            queuedSubscriptionId != bytes32(0);
            queuedSubscriptionId = queuedSubscription.nextSubscriptionId
        ) {
            queuedSubscription = subscriptions[queuedSubscriptionId];
            uint32 endTimestamp = queuedSubscription.endTimestamp;
            if (endTimestamp > block.timestamp) {
                expectedSponsorWalletBalance +=
                    ((endTimestamp - startTimestamp) *
                        queuedSubscription.dailyPrice) /
                    1 days;
                startTimestamp = endTimestamp;
            }
        }
    }

    /// @notice Computes the expected sponsor wallet balance after the
    /// respective subscription is added to the queue
    /// @dev This function is intended to be used by the API3 Market frontend
    /// to calculate how much the user should pay to purchase a specific
    /// subscription. As mentioned in the `buySubscription()` docstring, the
    /// user should aim for the sponsor wallet balance to be slightly more than
    /// the required amount in case it sends a transaction in the meantime,
    /// whose gas cost may decrease the sponsor wallet balance unexpectedly.
    /// Unit prices of the queued subscriptions are recorded on a daily basis
    /// and the expected balance is computed from these, which introduces a
    /// rounding error in the order of Weis. This also applies in practice (in
    /// that one can buy a subscription whose price is 1 ETH at 0.999... ETH).
    /// This behavior is accepted due to its effect being negligible.
    /// @param dapiName dAPI name
    /// @param updateParameters Update parameters
    /// @param duration Subscription duration
    /// @param price Subscription price
    /// @return expectedSponsorWalletBalance Expected sponsor wallet balance
    function computeExpectedSponsorWalletBalanceAfterSubscriptionIsAdded(
        bytes32 dapiName,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price
    ) external view override returns (uint256 expectedSponsorWalletBalance) {
        require(
            updateParameters.length == UPDATE_PARAMETERS_LENGTH,
            "Update parameters length invalid"
        );
        (
            bytes32 subscriptionId,
            uint32 endTimestamp,
            bytes32 previousSubscriptionId,
            bytes32 nextSubscriptionId
        ) = prospectSubscriptionPositionInQueue(
                dapiName,
                updateParameters,
                duration
            );
        uint256 dailyPrice = (price * 1 days) / duration;
        uint32 startTimestamp = SafeCast.toUint32(block.timestamp);
        bytes32 queuedSubscriptionId = previousSubscriptionId == bytes32(0)
            ? subscriptionId
            : dapiNameToCurrentSubscriptionId[dapiName];
        for (; queuedSubscriptionId != bytes32(0); ) {
            if (queuedSubscriptionId == subscriptionId) {
                expectedSponsorWalletBalance +=
                    ((endTimestamp - startTimestamp) * dailyPrice) /
                    1 days;
                startTimestamp = endTimestamp;
                queuedSubscriptionId = nextSubscriptionId;
            } else {
                Subscription storage queuedSubscription = subscriptions[
                    queuedSubscriptionId
                ];
                uint32 queuedSubscriptionEndTimestamp = queuedSubscription
                    .endTimestamp;
                if (queuedSubscriptionEndTimestamp > block.timestamp) {
                    expectedSponsorWalletBalance +=
                        ((queuedSubscriptionEndTimestamp - startTimestamp) *
                            queuedSubscription.dailyPrice) /
                        1 days;
                    startTimestamp = queuedSubscriptionEndTimestamp;
                }
                if (previousSubscriptionId == queuedSubscriptionId) {
                    queuedSubscriptionId = subscriptionId;
                } else {
                    queuedSubscriptionId = queuedSubscription
                        .nextSubscriptionId;
                }
            }
        }
    }

    /// @notice Gets all data about the dAPI that is available
    /// @dev This function is intended to be used by the API3 Market frontend
    /// to get all data related to a specific dAPI. It returns the entire
    /// subscription queue, including the items whose end timestamps are in the
    /// past.
    /// @param dapiName dAPI name
    /// @return dataFeedDetails Data feed details
    /// @return dapiValue dAPI value read from Api3ServerV1
    /// @return dapiTimestamp dAPI timestamp read from Api3ServerV1
    /// @return beaconValues Beacon values read from Api3ServerV1
    /// @return beaconTimestamps Beacon timestamps read from Api3ServerV1
    /// @return updateParameters Update parameters of the subscriptions in the
    /// queue
    /// @return endTimestamps End timestamps of the subscriptions in the queue
    /// @return dailyPrices Daily prices of the subscriptions in the queue
    function getDapiData(
        bytes32 dapiName
    )
        external
        view
        override
        returns (
            bytes memory dataFeedDetails,
            int224 dapiValue,
            uint32 dapiTimestamp,
            int224[] memory beaconValues,
            uint32[] memory beaconTimestamps,
            bytes[] memory updateParameters,
            uint32[] memory endTimestamps,
            uint224[] memory dailyPrices
        )
    {
        bytes32 currentDataFeedId = IApi3ServerV1(api3ServerV1)
            .dapiNameHashToDataFeedId(keccak256(abi.encodePacked(dapiName)));
        (
            dataFeedDetails,
            dapiValue,
            dapiTimestamp,
            beaconValues,
            beaconTimestamps
        ) = getDataFeedData(currentDataFeedId);
        uint256 queueLength = 0;
        for (
            bytes32 queuedSubscriptionId = dapiNameToCurrentSubscriptionId[
                dapiName
            ];
            queuedSubscriptionId != bytes32(0);
            queuedSubscriptionId = subscriptions[queuedSubscriptionId]
                .nextSubscriptionId
        ) {
            queueLength++;
        }
        updateParameters = new bytes[](queueLength);
        endTimestamps = new uint32[](queueLength);
        dailyPrices = new uint224[](queueLength);
        Subscription storage queuedSubscription = subscriptions[
            dapiNameToCurrentSubscriptionId[dapiName]
        ];
        for (uint256 ind = 0; ind < queueLength; ind++) {
            updateParameters[ind] = updateParametersHashToValue[
                queuedSubscription.updateParametersHash
            ];
            endTimestamps[ind] = queuedSubscription.endTimestamp;
            dailyPrices[ind] = queuedSubscription.dailyPrice;
            queuedSubscription = subscriptions[
                queuedSubscription.nextSubscriptionId
            ];
        }
    }

    /// @notice Gets all data about the data feed that is available
    /// @dev This function is intended to be used by the API3 Market frontend
    /// to determine what needs to be done to ready the data feed to purchase
    /// the respective subscription.
    /// In the case that the client wants to use this to fetch the respective
    /// Beacon readings for an unregistered data feed, they can do a static
    /// multicall where the `getDataFeedData()` call is preceded by a
    /// `registerDataFeed()` call.
    /// @param dataFeedId Data feed ID
    /// @return dataFeedDetails Data feed details
    /// @return dataFeedValue Data feed value read from Api3ServerV1
    /// @return dataFeedTimestamp Data feed timestamp read from Api3ServerV1
    /// @return beaconValues Beacon values read from Api3ServerV1
    /// @return beaconTimestamps Beacon timestamps read from Api3ServerV1
    function getDataFeedData(
        bytes32 dataFeedId
    )
        public
        view
        returns (
            bytes memory dataFeedDetails,
            int224 dataFeedValue,
            uint32 dataFeedTimestamp,
            int224[] memory beaconValues,
            uint32[] memory beaconTimestamps
        )
    {
        dataFeedDetails = AirseekerRegistry(airseekerRegistry)
            .dataFeedIdToDetails(dataFeedId);
        (dataFeedValue, dataFeedTimestamp) = IApi3ServerV1(api3ServerV1)
            .dataFeeds(dataFeedId);
        if (
            dataFeedDetails.length == DATA_FEED_DETAILS_LENGTH_FOR_SINGLE_BEACON
        ) {
            beaconValues = new int224[](1);
            beaconTimestamps = new uint32[](1);
            (address airnode, bytes32 templateId) = abi.decode(
                dataFeedDetails,
                (address, bytes32)
            );
            (beaconValues[0], beaconTimestamps[0]) = IApi3ServerV1(api3ServerV1)
                .dataFeeds(deriveBeaconId(airnode, templateId));
        } else if (dataFeedDetails.length != 0) {
            (address[] memory airnodes, bytes32[] memory templateIds) = abi
                .decode(dataFeedDetails, (address[], bytes32[]));
            uint256 beaconCount = airnodes.length;
            beaconValues = new int224[](beaconCount);
            beaconTimestamps = new uint32[](beaconCount);
            for (uint256 ind = 0; ind < beaconCount; ind++) {
                (beaconValues[ind], beaconTimestamps[ind]) = IApi3ServerV1(
                    api3ServerV1
                ).dataFeeds(deriveBeaconId(airnodes[ind], templateIds[ind]));
            }
        }
    }

    /// @notice Subscription ID to update parameters
    /// @param subscriptionId Subscription ID
    /// @return updateParameters Update parameters
    function subscriptionIdToUpdateParameters(
        bytes32 subscriptionId
    ) public view override returns (bytes memory updateParameters) {
        updateParameters = updateParametersHashToValue[
            subscriptions[subscriptionId].updateParametersHash
        ];
    }

    /// @notice Returns the signature delegation hash type used in delegation
    /// signatures
    /// @return Signature delegation hash type
    function signatureDelegationHashType()
        public
        view
        virtual
        override(HashRegistry, IHashRegistry)
        returns (bytes32)
    {
        return API3MARKET_SIGNATURE_DELEGATION_HASH_TYPE;
    }

    /// @notice Adds the subscription to the queue if applicable
    /// @param dapiName dAPI name
    /// @param dataFeedId Data feed ID
    /// @param updateParameters Update parameters
    /// @param duration Subscription duration
    /// @param price Subscription price
    function addSubscriptionToQueue(
        bytes32 dapiName,
        bytes32 dataFeedId,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price
    ) internal returns (bytes32 subscriptionId) {
        uint32 endTimestamp;
        bytes32 previousSubscriptionId;
        bytes32 nextSubscriptionId;
        (
            subscriptionId,
            endTimestamp,
            previousSubscriptionId,
            nextSubscriptionId
        ) = prospectSubscriptionPositionInQueue(
            dapiName,
            updateParameters,
            duration
        );
        bytes32 updateParametersHash = keccak256(updateParameters);
        if (updateParametersHashToValue[updateParametersHash].length == 0) {
            updateParametersHashToValue[
                updateParametersHash
            ] = updateParameters;
        }
        subscriptions[subscriptionId] = Subscription({
            updateParametersHash: updateParametersHash,
            endTimestamp: endTimestamp,
            dailyPrice: SafeCast.toUint224((price * 1 days) / duration),
            nextSubscriptionId: nextSubscriptionId
        });
        if (previousSubscriptionId == bytes32(0)) {
            if (subscriptionId != dapiNameToCurrentSubscriptionId[dapiName]) {
                emit UpdatedCurrentSubscriptionId(dapiName, subscriptionId);
                dapiNameToCurrentSubscriptionId[dapiName] = subscriptionId;
            }
            AirseekerRegistry(airseekerRegistry).setDapiNameUpdateParameters(
                dapiName,
                updateParameters
            );
            AirseekerRegistry(airseekerRegistry).setDapiNameToBeActivated(
                dapiName
            );
        } else {
            subscriptions[previousSubscriptionId]
                .nextSubscriptionId = subscriptionId;
            bytes32 currentSubscriptionId = dapiNameToCurrentSubscriptionId[
                dapiName
            ];
            if (
                subscriptions[currentSubscriptionId].endTimestamp <=
                block.timestamp
            ) {
                updateEndedCurrentSubscriptionId(
                    dapiName,
                    currentSubscriptionId
                );
            }
        }
        validateDataFeedReadiness(dataFeedId);
        if (
            IApi3ServerV1(api3ServerV1).dapiNameHashToDataFeedId(
                keccak256(abi.encodePacked(dapiName))
            ) != dataFeedId
        ) {
            IApi3ServerV1(api3ServerV1).setDapiName(dapiName, dataFeedId);
        }
    }

    /// @notice Updates the current subscription that has ended with the one
    /// that will end next
    /// @param dapiName dAPI name
    /// @param currentSubscriptionId Current subscription ID
    function updateEndedCurrentSubscriptionId(
        bytes32 dapiName,
        bytes32 currentSubscriptionId
    ) private {
        do {
            currentSubscriptionId = subscriptions[currentSubscriptionId]
                .nextSubscriptionId;
        } while (
            currentSubscriptionId != bytes32(0) &&
                subscriptions[currentSubscriptionId].endTimestamp <=
                block.timestamp
        );
        emit UpdatedCurrentSubscriptionId(dapiName, currentSubscriptionId);
        dapiNameToCurrentSubscriptionId[dapiName] = currentSubscriptionId;
        if (currentSubscriptionId == bytes32(0)) {
            AirseekerRegistry(airseekerRegistry).setDapiNameToBeDeactivated(
                dapiName
            );
        } else {
            AirseekerRegistry(airseekerRegistry).setDapiNameUpdateParameters(
                dapiName,
                subscriptionIdToUpdateParameters(currentSubscriptionId)
            );
        }
    }

    /// @notice Prospects the subscription position in the queue. It iterates
    /// through the entire subscription queue, which is implemented as a linked
    /// list, and returns the previous and next nodes of the subscription to be
    /// added.
    /// It reverts if no suitable position can be found, which would be because
    /// the addition of the subscription to the queue does not upgrade its
    /// specs unambiguously or addition of it results in the maximum queue
    /// length to be exceeded.
    /// @param dapiName dAPI name
    /// @param updateParameters Update parameters
    /// @param duration Subscription duration
    /// @return subscriptionId Subscription ID
    /// @return endTimestamp End timestamp
    /// @return previousSubscriptionId Previous subscription ID
    /// @return nextSubscriptionId Next subscription ID
    function prospectSubscriptionPositionInQueue(
        bytes32 dapiName,
        bytes calldata updateParameters,
        uint256 duration
    )
        private
        view
        returns (
            bytes32 subscriptionId,
            uint32 endTimestamp,
            bytes32 previousSubscriptionId,
            bytes32 nextSubscriptionId
        )
    {
        subscriptionId = keccak256(
            abi.encodePacked(dapiName, keccak256(updateParameters))
        );
        endTimestamp = SafeCast.toUint32(block.timestamp + duration);
        (
            uint256 deviationThresholdInPercentage,
            int224 deviationReference,
            uint256 heartbeatInterval
        ) = abi.decode(updateParameters, (uint256, int224, uint256));
        uint256 newQueueLength = 0;
        Subscription storage queuedSubscription;
        for (
            bytes32 queuedSubscriptionId = dapiNameToCurrentSubscriptionId[
                dapiName
            ];
            queuedSubscriptionId != bytes32(0);
            queuedSubscriptionId = queuedSubscription.nextSubscriptionId
        ) {
            queuedSubscription = subscriptions[queuedSubscriptionId];
            UpdateParametersComparisonResult updateParametersComparisonResult = compareUpdateParametersWithQueued(
                    deviationThresholdInPercentage,
                    deviationReference,
                    heartbeatInterval,
                    queuedSubscription.updateParametersHash
                );
            uint32 queuedSubscriptionEndTimestamp = queuedSubscription
                .endTimestamp;
            require(
                updateParametersComparisonResult ==
                    UpdateParametersComparisonResult.BetterThanQueued ||
                    endTimestamp > queuedSubscriptionEndTimestamp,
                "Subscription does not upgrade"
            );
            if (
                updateParametersComparisonResult ==
                UpdateParametersComparisonResult.WorseThanQueued &&
                queuedSubscriptionEndTimestamp > block.timestamp
            ) {
                previousSubscriptionId = queuedSubscriptionId;
                newQueueLength++;
            }
            if (
                updateParametersComparisonResult ==
                UpdateParametersComparisonResult.BetterThanQueued &&
                endTimestamp < queuedSubscriptionEndTimestamp
            ) {
                nextSubscriptionId = queuedSubscriptionId;
                for (
                    ;
                    queuedSubscriptionId != bytes32(0);
                    queuedSubscriptionId = subscriptions[queuedSubscriptionId]
                        .nextSubscriptionId
                ) {
                    newQueueLength++;
                }
                break;
            }
        }
        require(
            newQueueLength < maximumSubscriptionQueueLength,
            "Subscription queue full"
        );
    }

    /// @notice Compares the update parameters with the ones that belong to a
    /// queued subscription
    /// @param deviationThresholdInPercentage Deviation threshold in percentage
    /// @param deviationReference Deviation reference
    /// @param heartbeatInterval Heartbeat interval
    /// @param queuedUpdateParametersHash Queued update parameters hash
    /// @return Update parameters comparison result
    function compareUpdateParametersWithQueued(
        uint256 deviationThresholdInPercentage,
        int224 deviationReference,
        uint256 heartbeatInterval,
        bytes32 queuedUpdateParametersHash
    ) private view returns (UpdateParametersComparisonResult) {
        // The update parameters that belong to a queued subscription are
        // guaranteed to have been stored in the hash map
        (
            uint256 queuedDeviationThresholdInPercentage,
            int224 queuedDeviationReference,
            uint256 queuedHeartbeatInterval
        ) = abi.decode(
                updateParametersHashToValue[queuedUpdateParametersHash],
                (uint256, int224, uint256)
            );
        require(
            deviationReference == queuedDeviationReference,
            "Deviation references not equal"
        );
        if (
            (deviationThresholdInPercentage ==
                queuedDeviationThresholdInPercentage) &&
            (heartbeatInterval == queuedHeartbeatInterval)
        ) {
            return UpdateParametersComparisonResult.EqualToQueued;
        } else if (
            (deviationThresholdInPercentage <=
                queuedDeviationThresholdInPercentage) &&
            (heartbeatInterval <= queuedHeartbeatInterval)
        ) {
            return UpdateParametersComparisonResult.BetterThanQueued;
        } else if (
            (deviationThresholdInPercentage >=
                queuedDeviationThresholdInPercentage) &&
            (heartbeatInterval >= queuedHeartbeatInterval)
        ) {
            return UpdateParametersComparisonResult.WorseThanQueued;
        } else {
            // This is hit when the set of parameters are superior to each
            // other in different aspects, in which case they should not be
            // allowed to be in the same queue
            revert("Update parameters incomparable");
        }
    }

    /// @notice Validates the readiness of the data feed. The data feed must
    /// have been updated on Api3ServerV1 in the last `MAXIMUM_DAPI_UPDATE_AGE`
    /// and registered on AirseekerRegistry.
    /// @param dataFeedId Data feed ID
    function validateDataFeedReadiness(bytes32 dataFeedId) private view {
        (, uint32 timestamp) = IApi3ServerV1(api3ServerV1).dataFeeds(
            dataFeedId
        );
        require(
            block.timestamp <= timestamp + MAXIMUM_DAPI_UPDATE_AGE,
            "Data feed value stale"
        );
        require(
            AirseekerRegistry(airseekerRegistry).dataFeedIsRegistered(
                dataFeedId
            ),
            "Data feed not registered"
        );
    }

    /// @notice Verifies the dAPI management Merkle proof
    /// @param dapiName dAPI name
    /// @param dataFeedId Data feed ID
    /// @param sponsorWallet Sponsor wallet address
    /// @param dapiManagementMerkleData ABI-encoded dAPI management Merkle root
    /// and proof
    function verifyDapiManagementMerkleProof(
        bytes32 dapiName,
        bytes32 dataFeedId,
        address sponsorWallet,
        bytes calldata dapiManagementMerkleData
    ) private view {
        require(dapiName != bytes32(0), "dAPI name zero");
        (
            bytes32 dapiManagementMerkleRoot,
            bytes32[] memory dapiManagementMerkleProof
        ) = abi.decode(dapiManagementMerkleData, (bytes32, bytes32[]));
        require(
            hashes[DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE].value ==
                dapiManagementMerkleRoot,
            "Invalid root"
        );
        require(
            MerkleProof.verify(
                dapiManagementMerkleProof,
                dapiManagementMerkleRoot,
                keccak256(
                    bytes.concat(
                        keccak256(
                            abi.encode(dapiName, dataFeedId, sponsorWallet)
                        )
                    )
                )
            ),
            "Invalid proof"
        );
    }

    function verifyDapiManagementAndDapiPricingMerkleProofs(
        bytes32 dapiName,
        bytes32 dataFeedId,
        address sponsorWallet,
        bytes calldata updateParameters,
        uint256 duration,
        uint256 price,
        bytes calldata dapiManagementAndDapiPricingMerkleData
    ) private view {
        require(dapiName != bytes32(0), "dAPI name zero");
        require(
            updateParameters.length == UPDATE_PARAMETERS_LENGTH,
            "Update parameters length invalid"
        );
        require(duration != 0, "Duration zero");
        require(price != 0, "Price zero");
        (
            bytes32 dapiManagementMerkleRoot,
            bytes32[] memory dapiManagementMerkleProof,
            bytes32 dapiPricingMerkleRoot,
            bytes32[] memory dapiPricingMerkleProof
        ) = abi.decode(
                dapiManagementAndDapiPricingMerkleData,
                (bytes32, bytes32[], bytes32, bytes32[])
            );
        require(
            hashes[DAPI_MANAGEMENT_MERKLE_ROOT_HASH_TYPE].value ==
                dapiManagementMerkleRoot,
            "Invalid root"
        );
        require(
            MerkleProof.verify(
                dapiManagementMerkleProof,
                dapiManagementMerkleRoot,
                keccak256(
                    bytes.concat(
                        keccak256(
                            abi.encode(dapiName, dataFeedId, sponsorWallet)
                        )
                    )
                )
            ),
            "Invalid proof"
        );
        require(
            hashes[DAPI_PRICING_MERKLE_ROOT_HASH_TYPE].value ==
                dapiPricingMerkleRoot,
            "Invalid root"
        );
        require(
            MerkleProof.verify(
                dapiPricingMerkleProof,
                dapiPricingMerkleRoot,
                keccak256(
                    bytes.concat(
                        keccak256(
                            abi.encode(
                                dapiName,
                                block.chainid,
                                updateParameters,
                                duration,
                                price
                            )
                        )
                    )
                )
            ),
            "Invalid proof"
        );
    }

    /// @notice Verifies the signed API URL Merkle proof
    /// @param airnode Airnode address
    /// @param signedApiUrl Signed API URL
    /// @param signedApiUrlMerkleData ABI-encoded signed API URL Merkle root
    /// and proof
    function verifySignedApiUrlMerkleProof(
        address airnode,
        string calldata signedApiUrl,
        bytes calldata signedApiUrlMerkleData
    ) private view {
        (
            bytes32 signedApiUrlMerkleRoot,
            bytes32[] memory signedApiUrlMerkleProof
        ) = abi.decode(signedApiUrlMerkleData, (bytes32, bytes32[]));
        require(
            hashes[SIGNED_API_URL_MERKLE_ROOT_HASH_TYPE].value ==
                signedApiUrlMerkleRoot,
            "Invalid root"
        );
        require(
            MerkleProof.verify(
                signedApiUrlMerkleProof,
                signedApiUrlMerkleRoot,
                keccak256(
                    bytes.concat(keccak256(abi.encode(airnode, signedApiUrl)))
                )
            ),
            "Invalid proof"
        );
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
}
