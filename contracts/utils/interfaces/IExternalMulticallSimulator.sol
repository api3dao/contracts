// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ISelfMulticall.sol";

interface IExternalMulticallSimulator is ISelfMulticall {
    function functionCall(
        address target,
        bytes memory data
    ) external returns (bytes memory);
}
