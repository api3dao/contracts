// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title Interface that OEV bid payers (i.e., contracts that call
/// `payOevBid()` of Api3ServerV1OevExtension) must implement
interface IApi3ServerV1OevExtensionOevBidPayer {
    /// @notice Called back by Api3ServerV1OevExtension after an OEV bid payer
    /// has called `payOevBid()` of Api3ServerV1OevExtension. During the
    /// callback, the OEV bid payer will be allowed to update the OEV feeds
    /// of the respective dApp. Before returning, the OEV bid payer must ensure
    /// that at least the bid amount has been sent to Api3ServerV1OevExtension.
    /// The returndata must start with the keccak256 hash of
    /// "Api3ServerV1OevExtensionOevBidPayer.onOevBidPayment".
    /// @param bidAmount Bid amount
    /// @param data Data that is passed through the callback
    /// @return oevBidPaymentCallbackSuccess OEV bid payment callback success
    /// code
    function onOevBidPayment(
        uint256 bidAmount,
        bytes calldata data
    ) external returns (bytes32 oevBidPaymentCallbackSuccess);
}
