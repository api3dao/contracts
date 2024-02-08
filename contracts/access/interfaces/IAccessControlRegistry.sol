// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../vendor/@openzeppelin/contracts@4.8.2/access/IAccessControl.sol";
import "../../utils/interfaces/ISelfMulticall.sol";

interface IAccessControlRegistry is IAccessControl, ISelfMulticall {
    event InitializedManager(
        bytes32 indexed rootRole,
        address indexed manager,
        address sender
    );

    event InitializedRole(
        bytes32 indexed role,
        bytes32 indexed adminRole,
        string description,
        address sender
    );

    function initializeManager(address manager) external;

    function initializeRoleAndGrantToSender(
        bytes32 adminRole,
        string calldata description
    ) external returns (bytes32 role);
}
