//SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "../vendor/@gnosis.pm/safe-contracts@1.3.0/contracts/GnosisSafe.sol";

/// @title Gnosis Safe 1.3.0 modified to be used without a proxy
contract GnosisSafeWithoutProxy is GnosisSafe {
    /// @dev The GnosisSafe constructor disables the contract from being set up
    /// so that it can only be used through proxies. We undo that here and then
    /// do the setup.
    /// @param _owners Owners
    /// @param _threshold Number of required confirmations for a transaction
    constructor(address[] memory _owners, uint256 _threshold) {
        // Reset `threshold` to be able to set up owners
        threshold = 0;
        // Go through the GnosisSafe `setup()` steps
        setupOwners(_owners, _threshold);
        // Do not set up a fallback handler
        address fallbackHandler = address(0);
        // Do not set up modules
        address to = address(0);
        bytes memory data = "";
        setupModules(to, data);
        // Do not make payment
        // Emit the event as if `setup()` was called
        emit SafeSetup(msg.sender, _owners, _threshold, to, fallbackHandler);
    }
}
