// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "../vendor/@openzeppelin/contracts@5.0.2/proxy/utils/UUPSUpgradeable.sol";
import "../vendor/@openzeppelin/contracts-upgradeable@5.0.2/access/OwnableUpgradeable.sol";
import "../interfaces/IApi3ReaderProxy.sol";
import "../api3-server-v1/interfaces/IApi3ServerV1.sol";

// Mock Api3ReaderProxyV2 contract to test the upgrade mechanism
contract MockApi3ReaderProxyV2 is
    UUPSUpgradeable,
    OwnableUpgradeable,
    IApi3ReaderProxy
{
    address public immutable api3ServerV1;

    bytes32 public immutable dapiName;

    bytes32 private immutable dapiNameHash;

    constructor(address api3ServerV1_, bytes32 dapiName_) {
        api3ServerV1 = api3ServerV1_;
        dapiName = dapiName_;
        dapiNameHash = keccak256(abi.encodePacked(dapiName));
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
    }

    function read()
        public
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = IApi3ServerV1(api3ServerV1).dataFeeds(
            IApi3ServerV1(api3ServerV1).dapiNameHashToDataFeedId(dapiNameHash)
        );
        require(timestamp != 0, "Data feed is not initialized");
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyOwner {}
}
