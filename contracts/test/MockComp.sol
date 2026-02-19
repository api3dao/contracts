// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Comp} from "../vendor/@compound-finance/compound-governance/contracts/Comp.sol";

contract MockComp is Comp {
    constructor(address account) Comp(account) {}

    function mint(address to, uint96 amount) external {
        balances[to] += amount;
        _moveDelegates(delegates[address(0)], delegates[to], amount);
    }
}
