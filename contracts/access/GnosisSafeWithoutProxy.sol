//SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "../vendor/@gnosis.pm/safe-contracts@1.3.0/contracts/GnosisSafe.sol";

/// @title Gnosis Safe contract modified to be used without a proxy
contract GnosisSafeWithoutProxy is GnosisSafe {
    /// @dev GnosisSafe constructor disables the contract from being set up so
    /// that it can only be used through proxies. We undo that here and then
    /// set the Safe up.
    /// We do not set a fallback handler or any modules. These can be done
    /// later on by the owners.
    /// @param _owners List of Safe owners
    /// @param _threshold Number of required confirmations for a Safe
    /// transaction
    constructor(address[] memory _owners, uint256 _threshold) {
        // Go through the GnosisSafe `setup()` steps
        // Reset `threshold` to be able to set up owners
        threshold = 0;
        setupOwners(_owners, _threshold);
        // Do not set up a fallback handler
        address fallbackHandler = address(0);
        // Do not set up modules
        address to = address(0);
        bytes memory data = "";
        setupModules(to, data);
        // Do not make payment
        // Emit the event as if we have called `setup()`
        emit SafeSetup(msg.sender, _owners, _threshold, to, fallbackHandler);
    }
}
