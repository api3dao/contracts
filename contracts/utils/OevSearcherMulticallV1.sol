// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../vendor/@openzeppelin/contracts@4.9.5/access/Ownable.sol";
import "./interfaces/IOevSearcherMulticallV1.sol";

/// @title Contract that enables the owner OEV searcher to make batched calls
/// to external, trusted accounts to facilitate value extraction
/// @notice Any of the batched calls reverting will result in the transaction
/// to be reverted. Batched calls are allowed to send values. The contract is
/// allowed to receive funds in case this is required during value extraction.
/// @dev OEV searchers that will be targeting the same contracts repeatedly are
/// recommended to develop and use an optimized version of this contract
contract OevSearcherMulticallV1 is Ownable, IOevSearcherMulticallV1 {
    receive() external payable {}

    /// @notice Called by the owner OEV searcher to batch calls with value to
    /// external, trusted accounts. Any of these calls reverting causes this
    /// function to revert.
    /// @dev Calls made to non-contract accounts do not revert. This can be
    /// used to sweep the funds in the contract.
    /// @param targets Array of target addresses of batched calls
    /// @param data Array of calldata of batched calls
    /// @param values Array of values of batched calls
    /// @return returndata Array of returndata of batched calls
    function externalMulticallWithValue(
        address[] calldata targets,
        bytes[] calldata data,
        uint256[] calldata values
    ) external payable override onlyOwner returns (bytes[] memory returndata) {
        uint256 callCount = targets.length;
        require(
            callCount == data.length && callCount == values.length,
            "Parameter length mismatch"
        );
        returndata = new bytes[](callCount);
        for (uint256 ind = 0; ind < callCount; ) {
            bool success;
            // solhint-disable-next-line avoid-low-level-calls
            (success, returndata[ind]) = targets[ind].call{value: values[ind]}(
                data[ind]
            );
            if (!success) {
                bytes memory returndataWithRevertData = returndata[ind];
                // Adapted from OpenZeppelin's Address.sol
                if (returndataWithRevertData.length > 0) {
                    // solhint-disable-next-line no-inline-assembly
                    assembly {
                        let returndata_size := mload(returndataWithRevertData)
                        revert(
                            add(32, returndataWithRevertData),
                            returndata_size
                        )
                    }
                } else {
                    // Attempt to make sense of the silent revert after the
                    // fact to optimize for the happy path
                    require(
                        address(this).balance >= values[ind],
                        "Multicall: Insufficient balance"
                    );
                    revert("Multicall: No revert string");
                }
            }
            unchecked {
                ind++;
            }
        }
    }

    /// @notice Called by the owner to renounce the ownership of the contract
    function renounceOwnership() public virtual override(Ownable, IOwnable) {
        super.renounceOwnership();
    }

    /// @notice Called by the owner to transfer the ownership of the contract
    /// @param newOwner New owner address
    function transferOwnership(
        address newOwner
    ) public virtual override(Ownable, IOwnable) {
        super.transferOwnership(newOwner);
    }

    /// @notice Returns the owner address
    /// @return Owner address
    function owner()
        public
        view
        virtual
        override(Ownable, IOwnable)
        returns (address)
    {
        return super.owner();
    }
}
