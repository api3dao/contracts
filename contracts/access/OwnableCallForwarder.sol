// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../vendor/@openzeppelin/contracts@4.8.2/access/Ownable.sol";
import "../vendor/@openzeppelin/contracts@4.8.2/utils/Address.sol";
import "./interfaces/IOwnableCallForwarder.sol";

/// @title Contract that forwards the calls that its owner sends
/// @notice AccessControlRegistry users that want their access control tables
/// to be transferrable (e.g., a DAO) will use this forwarder instead of
/// interacting with it directly. There are cases where this transferrability
/// is not desired, e.g., if the user is an Airnode and is immutably associated
/// with a single address, in which case the manager will interact with
/// AccessControlRegistry directly.
contract OwnableCallForwarder is Ownable, IOwnableCallForwarder {
    /// @param _owner Owner address
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    /// @notice Forwards the calldata and the value to the target address if
    /// the sender is the owner and returns the data
    /// @param forwardTarget Target address that the calldata will be forwarded
    /// to
    /// @param forwardedCalldata Calldata to be forwarded to the target address
    /// @return returnedData Data returned by the forwarded call
    function forwardCall(
        address forwardTarget,
        bytes calldata forwardedCalldata
    ) external payable override onlyOwner returns (bytes memory returnedData) {
        returnedData = Address.functionCallWithValue(
            forwardTarget,
            forwardedCalldata,
            msg.value
        );
    }
}
