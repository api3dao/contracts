// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/utils/Initializable.sol";
import "./interfaces/IDapiProxyUpgradeableV1.sol";
import "../interfaces/IApi3ServerV1.sol";
import "../interfaces/IApi3ServerV1OevExtension.sol";

contract DapiProxyUpgradeableV1 is Initializable, IDapiProxyUpgradeableV1 {
    /// @custom:storage-location erc7201:DapiProxyUpgradeableV1
    struct DapiProxyUpgradeableV1Storage {
        address api3ServerV1;
        address api3ServerV1OevExtension;
        bytes32 dapiNameHash;
        uint256 dappId;
    }

    // keccak256(abi.encode(uint256(keccak256("DapiProxyUpgradeableV1")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant DAPIPROXYUPGRADEABLEV1_STORAGE_LOCATION =
        0xdfd360786ab61a078458da2507ce3a7951bb29b20ca802d2907b276a65843200;

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _api3ServerV1,
        address _api3ServerV1OevExtension,
        bytes32 _dapiNameHash,
        uint256 _dappId
    ) external initializer {
        require(_api3ServerV1 != address(0), "Api3ServerV1 address zero");
        require(
            _api3ServerV1OevExtension != address(0),
            "Api3ServerV1OevExtension address zero"
        );
        require(_dapiNameHash != bytes32(0), "dAPI name hash zero");
        require(_dappId != 0, "dApp ID zero");
        DapiProxyUpgradeableV1Storage
            storage $ = _getDapiProxyUpgradeableV1Storage();
        $.api3ServerV1 = _api3ServerV1;
        $.api3ServerV1OevExtension = _api3ServerV1OevExtension;
        $.dapiNameHash = _dapiNameHash;
        $.dappId = _dappId;
    }

    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        DapiProxyUpgradeableV1Storage
            storage $ = _getDapiProxyUpgradeableV1Storage();
        bytes32 dataFeedId = IApi3ServerV1($.api3ServerV1)
            .dapiNameHashToDataFeedId($.dapiNameHash);
        require(dataFeedId != bytes32(0), "dAPI name not set");
        (int224 baseDapiValue, uint32 baseDapiTimestamp) = IApi3ServerV1(
            $.api3ServerV1
        ).dataFeeds(dataFeedId);
        (
            int224 oevDapiValue,
            uint32 oevDapiTimestamp
        ) = IApi3ServerV1OevExtension($.api3ServerV1OevExtension).oevDataFeed(
                $.dappId,
                dataFeedId
            );
        if (oevDapiTimestamp > baseDapiTimestamp) {
            (value, timestamp) = (oevDapiValue, oevDapiTimestamp);
        } else {
            (value, timestamp) = (baseDapiValue, baseDapiTimestamp);
        }
        require(timestamp > 0, "Data feed not initialized");
    }

    function api3ServerV1() external view override returns (address) {
        return _getDapiProxyUpgradeableV1Storage().api3ServerV1;
    }

    function api3ServerV1OevExtension()
        external
        view
        override
        returns (address)
    {
        return _getDapiProxyUpgradeableV1Storage().api3ServerV1OevExtension;
    }

    function dapiNameHash() external view override returns (bytes32) {
        return _getDapiProxyUpgradeableV1Storage().dapiNameHash;
    }

    function dappId() external view override returns (uint256) {
        return _getDapiProxyUpgradeableV1Storage().dappId;
    }

    function _getDapiProxyUpgradeableV1Storage()
        private
        pure
        returns (DapiProxyUpgradeableV1Storage storage $)
    {
        assembly {
            $.slot := DAPIPROXYUPGRADEABLEV1_STORAGE_LOCATION
        }
    }
}
