// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../utils/SelfMulticall.sol";
import "./interfaces/IExternalMulticallSimulator.sol";
import "../vendor/@openzeppelin/contracts@4.9.5/utils/Address.sol";

/// @title Contract that simulates external calls in single or batched form
/// @notice The contract only allows eth_call to be used for while making
/// external calls to ensure that it is only used for simulating outcomes,
/// rather than sending actual transactions
contract ExternalMulticallSimulator is
    SelfMulticall,
    IExternalMulticallSimulator
{
    /// @dev Only allows calls where the sender is address-zero and the gas
    /// price is zero, which indicates that the call is made through eth_call
    modifier onlyEthCall() {
        require(msg.sender == address(0), "Sender address not zero");
        require(tx.gasprice == 0, "Tx gas price not zero");
        _;
    }

    /// @notice eth_call'ed to simulate an external call
    /// @param target Target address of the external call
    /// @param data Calldata of the external call
    /// @return Returndata of the external call
    function functionCall(
        address target,
        bytes memory data
    ) external override onlyEthCall returns (bytes memory) {
        return Address.functionCall(target, data);
    }
}
