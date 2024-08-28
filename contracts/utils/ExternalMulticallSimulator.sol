// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../utils/SelfMulticall.sol";
import "./interfaces/IExternalMulticallSimulator.sol";
import "../vendor/@openzeppelin/contracts@4.9.5/utils/Address.sol";

/// @title Contract that simulates external calls in single or batched form
/// @notice This contract requires address-zero to be impersonated and zero gas
/// price to be used while making external calls to ensure that it is only used
/// for simulating outcomes rather than sending transactions
contract ExternalMulticallSimulator is
    SelfMulticall,
    IExternalMulticallSimulator
{
    /// @notice eth_call'ed while impersonating address-zero with zero gas
    /// price to simulate an external call
    /// @param target Target address of the external call
    /// @param data Calldata of the external call
    /// @return Returndata of the external call
    function functionCall(
        address target,
        bytes memory data
    ) external override returns (bytes memory) {
        require(msg.sender == address(0), "Sender address not zero");
        require(tx.gasprice == 0, "Tx gas price not zero");
        return Address.functionCall(target, data);
    }
}
