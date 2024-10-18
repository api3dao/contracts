// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../vendor/@openzeppelin/contracts@4.8.2/access/Ownable.sol";
import "../api3-server-v1/interfaces/IApi3ServerV1OevExtensionOevBidPayer.sol";
import "../vendor/@openzeppelin/contracts@4.8.2/utils/Address.sol";
import "../api3-server-v1/interfaces/IApi3ServerV1OevExtension.sol";

contract MockApi3ServerV1OevExtensionOevBidPayer is
    Ownable,
    IApi3ServerV1OevExtensionOevBidPayer
{
    address public immutable api3ServerV1OevExtension;

    constructor(address initialOwner, address api3ServerV1OevExtension_) {
        _transferOwnership(initialOwner);
        api3ServerV1OevExtension = api3ServerV1OevExtension_;
    }

    receive() external payable {}

    function payOevBid(
        uint256 dappId,
        uint256 bidAmount,
        uint32 signedDataTimestampCutoff,
        bytes calldata signature,
        bytes calldata data
    ) external {
        // This contract would normally not be allowed to call its
        // `payOevBid()`, we are doing this here to test
        // Api3ServerV1OevExtension reentrancy in OEV bid payment callback.
        if (msg.sender != address(this)) {
            _checkOwner();
        }
        IApi3ServerV1OevExtension(api3ServerV1OevExtension).payOevBid(
            dappId,
            bidAmount,
            signedDataTimestampCutoff,
            signature,
            data
        );
    }

    function onOevBidPayment(
        uint256 bidAmount,
        bytes calldata data
    ) external override returns (bytes32 oevBidPaymentCallbackSuccess) {
        require(
            msg.sender == api3ServerV1OevExtension,
            "Not Api3ServerV1OevExtension"
        );
        // We have a special `data` value make `onOevBidPayment()` return an
        // incorrect code to cover that test case.
        if (keccak256(data) == keccak256(hex"1234")) {
            return bytes32(0);
        }
        // We have a special `data` value cause the paid amount to be the half
        // of the bid amount to cover that test case.
        if (keccak256(data) == keccak256(hex"5678")) {
            bidAmount /= 2;
        }
        // `data` is the calldata of a call to self here to cover the test
        // cases in a convenient way. This does not need to be the case for all
        // OEV bid payer contracts.
        else if (data.length > 0) {
            Address.functionCall(address(this), data);
        }
        (bool success, ) = msg.sender.call{value: bidAmount}("");
        require(success, "OEV bid payment failed");
        oevBidPaymentCallbackSuccess = keccak256(
            "Api3ServerV1OevExtensionOevBidPayer.onOevBidPayment"
        );
    }

    function updateDappOevDataFeed(
        uint256 dappId,
        bytes[] calldata signedData
    ) external {
        if (msg.sender != address(this)) {
            _checkOwner();
        }
        IApi3ServerV1OevExtension(api3ServerV1OevExtension)
            .updateDappOevDataFeed(dappId, signedData);
    }

    // A normal OEV bid payer contract would not have this function. It is
    // added to test Api3ServerV1OevExtension reentrancy in OEV bid payment
    // callback.
    function withdraw(address recipient, uint256 amount) external {
        require(msg.sender == address(this), "Sender not this contract");
        IApi3ServerV1OevExtension(api3ServerV1OevExtension).withdraw(
            recipient,
            amount
        );
    }
}
