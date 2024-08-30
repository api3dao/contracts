//SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

contract MockSafeTarget {
    address public immutable safe;

    address public immutable forwarder;

    uint256 public number;

    constructor(address _safe, address _forwarder) {
        safe = _safe;
        forwarder = _forwarder;
    }

    receive() external payable {}

    function setNumberAsSafe(uint256 _number) external payable {
        require(msg.sender == safe, "Sender not safe");
        number = _number;
    }

    function setNumberAsForwarder(uint256 _number) external payable {
        require(msg.sender == forwarder, "Sender not forwarder");
        number = _number;
    }
}
