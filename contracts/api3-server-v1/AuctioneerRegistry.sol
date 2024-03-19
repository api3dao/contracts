// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../vendor/@openzeppelin/contracts@4.9.5/access/Ownable.sol";
import "../utils/SelfMulticall.sol";
import "../vendor/@openzeppelin/contracts@4.9.5/utils/structs/EnumerableSet.sol";
import "../vendor/@openzeppelin/contracts@4.9.5/utils/cryptography/ECDSA.sol";

// This contract is for a single auctioneer
contract AuctioneerRegistry is Ownable, SelfMulticall {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // A single source is probably fine here
    address public immutable usdRateAirnode;

    bytes32 public immutable usdRateTemplateId;

    // This fee shouldn't guarantee indefinite support. We can specify that we
    // will deactivate proxies that haven't generated any OEV for a length of
    // time. Similarly, we should be able to deactivate proxies whose data is
    // not formatted correctly, or ones that are on chains that we're not
    // serving yet, etc. Payment should not be reason to allow these to take up
    // auctioneer capacity.
    uint256 public activationFeeInUsdWith18Decimals;

    uint256 public maximumOevProxyCount;

    mapping(bytes32 => bytes) public hashToOevProxyData;

    EnumerableSet.Bytes32Set private oevProxyDataHashSet;

    constructor(
        address usdRateAirnode_,
        bytes32 usdRateTemplateId_,
        uint256 activationFeeInUsdWith18Decimals_,
        uint256 maximumOevProxyCount_
    ) {
        require(usdRateAirnode_ != address(0), "Airnode address zero");
        require(usdRateTemplateId_ != bytes32(0), "Template ID zero");
        require(activationFeeInUsdWith18Decimals_ != 0, "Activation fee zero");
        require(maximumOevProxyCount_ != 0, "Maximum OEV proxy count zero");
        usdRateAirnode = usdRateAirnode_;
        usdRateTemplateId = usdRateTemplateId_;
        activationFeeInUsdWith18Decimals = activationFeeInUsdWith18Decimals_;
        maximumOevProxyCount = maximumOevProxyCount_;
    }

    function setActivationFee(
        uint256 activationFeeInUsdWith18Decimals_
    ) external onlyOwner {
        require(activationFeeInUsdWith18Decimals_ != 0, "Activation fee zero");
        activationFeeInUsdWith18Decimals = activationFeeInUsdWith18Decimals_;
        // Emit event
    }

    function setMaximumOevProxyCount(
        uint256 maximumOevProxyCount_
    ) external onlyOwner {
        require(maximumOevProxyCount_ != 0, "Maximum OEV proxy count zero");
        maximumOevProxyCount = maximumOevProxyCount_;
        // Emit event
    }

    function withdraw(address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Recipient address zero");
        require(amount != 0, "Amount zero");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer unsuccessful");
        // Emit event
    }

    // The OEV proxy data is:
    //   - Chain ID
    //   - Data feed ID / dAPI name
    //   - Is dAPI
    //   - Beneficiary address
    //   - Data
    // We do not derive/validate the proxy address on-chain in case the logic
    // for doing so is different for a future integration (such as zksync).
    // The auctioneer is allowed to deny service to OEV proxies based on
    // arbitrary off-chain rules. For example, the data not being formatted
    // correctly, or the proxy belonging to a chain that the specific
    // auctioneer with the AuctioneerRegistry contract is not serving can be
    // reasons to deny service.
    function activateOevProxyAsOwner(
        bytes calldata oevProxyData
    ) external onlyOwner {
        activateOevProxy(oevProxyData);
    }

    function activateOevProxyWithPayment(
        uint256 timestamp,
        bytes calldata data,
        bytes calldata signature,
        bytes calldata oevProxyData
    ) external payable {
        require(data.length == 32, "Data length invalid");
        require(
            timestamp < block.timestamp &&
                timestamp + 1 minutes >= block.timestamp,
            "Timestamp invalid"
        );
        require(
            ECDSA.recover(
                ECDSA.toEthSignedMessageHash(
                    keccak256(
                        abi.encodePacked(usdRateTemplateId, timestamp, data)
                    )
                ),
                signature
            ) == usdRateAirnode,
            "Signature mismatch"
        );
        int256 usdRateWith18Decimals = abi.decode(data, (int256));
        require(usdRateWith18Decimals > 0, "USD rate negative");
        require(
            (msg.value * uint256(usdRateWith18Decimals)) / 1 ether >=
                activationFeeInUsdWith18Decimals,
            "Insufficient payment"
        );
        activateOevProxy(oevProxyData);
    }

    function activateOevProxy(bytes calldata oevProxyData) private {
        require(oevProxyData.length != 0, "Data empty");
        require(
            activeOevProxyCount() < maximumOevProxyCount,
            "OEV proxy capacity full"
        );
        bytes32 oevProxyDataHash = keccak256(oevProxyData);
        if (hashToOevProxyData[oevProxyDataHash].length == 0) {
            hashToOevProxyData[oevProxyDataHash] = oevProxyData;
        }
        if (!oevProxyDataHashSet.contains(oevProxyDataHash)) {
            // Emit event
            oevProxyDataHashSet.add(oevProxyDataHash);
        }
    }

    function deactivateOevProxyAsOwner(
        bytes32 oevProxyDataHash
    ) external onlyOwner {
        if (oevProxyDataHashSet.contains(oevProxyDataHash)) {
            oevProxyDataHashSet.remove(oevProxyDataHash);
            // Emit event
        }
    }

    // Auctioneer multicalls the below two functions
    function activeOevProxyCount() public view returns (uint256) {
        return oevProxyDataHashSet.length();
    }

    function activeOevProxyData(
        uint256 index
    ) external view returns (bytes memory oevProxyData) {
        if (index < activeOevProxyCount()) {
            oevProxyData = hashToOevProxyData[
                oevProxyDataHashSet.at(index)
            ];
        }
    }
}
