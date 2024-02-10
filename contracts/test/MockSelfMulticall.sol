// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../utils/SelfMulticall.sol";
import "./MockMulticallTarget.sol";

contract MockSelfMulticall is SelfMulticall, MockMulticallTarget {}
