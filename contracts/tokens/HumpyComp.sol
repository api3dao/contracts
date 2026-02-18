// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Ownable, Ownable2Step} from "../vendor/@openzeppelin/contracts@5.0.2/access/Ownable2Step.sol";
import {ERC20} from "../vendor/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol";
import {IERC20} from "../vendor/@openzeppelin/contracts@5.0.2/token/ERC20/IERC20.sol";
import {ERC20Wrapper} from "../vendor/@openzeppelin/contracts@5.0.2/token/ERC20/extensions/ERC20Wrapper.sol";
import {IComp} from "../vendor/@compound-finance/compound-governance/contracts/interfaces/IComp.sol";

/// @title Humpy COMP
/// @author API3 DAO
/// @notice 1:1 wrapper token for COMP built on OpenZeppelin ERC20Wrapper
contract HumpyComp is ERC20Wrapper, Ownable2Step {
    address internal constant COMP_ADDRESS =
        0xc00e94Cb662C3520282E6f5717214004A7f26888;
    IComp internal immutable comp = IComp(COMP_ADDRESS);

    /// @notice Constructs the Humpy COMP wrapper
    /// @param initialOwner Address of the initial owner
    /// @param initialDelegatee Address of the initial delegatee for COMP voting power
    constructor(
        address initialOwner,
        address initialDelegatee
    )
        ERC20("Humpy COMP", "HumpyCOMP")
        ERC20Wrapper(IERC20(COMP_ADDRESS))
        Ownable(initialOwner)
    {
        _setDelegatee(initialDelegatee);
    }

    /// @notice Returns the current COMP delegatee for voting power held by this wrapper
    /// @return delegateeAddress Current delegatee address
    function delegatee() external view returns (address) {
        return comp.delegates(address(this));
    }

    /// @notice Wraps COMP tokens for the caller at a 1:1 ratio
    /// @param value Amount of COMP to deposit
    /// @return success Whether wrapping succeeded
    function deposit(uint256 value) external returns (bool) {
        return depositFor(msg.sender, value);
    }

    /// @notice Unwraps HumpyCOMP tokens for the caller at a 1:1 ratio
    /// @param value Amount of HumpyCOMP to burn and withdraw as COMP
    /// @return success Whether unwrapping succeeded
    function withdraw(uint256 value) external returns (bool) {
        return withdrawTo(msg.sender, value);
    }

    /**
     * @notice Allows the owner to change who receives the aggregated voting power
     * @param newDelegatee The new address to receive the COMP voting power
     */
    function setDelegatee(address newDelegatee) external onlyOwner {
        _setDelegatee(newDelegatee);
    }

    /**
     * @notice Updates delegated voting power recipient for COMP held by this wrapper
     * @param newDelegatee New delegatee address
     */
    function _setDelegatee(address newDelegatee) internal {
        comp.delegate(newDelegatee);
    }
}
