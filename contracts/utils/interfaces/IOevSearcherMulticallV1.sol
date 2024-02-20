// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access/interfaces/IOwnable.sol";

interface IOevSearcherMulticallV1 is IOwnable {
    function externalMulticallWithValue(
        address[] calldata targets,
        bytes[] calldata data,
        uint256[] calldata values
    ) external payable returns (bytes[] memory returndata);
}
