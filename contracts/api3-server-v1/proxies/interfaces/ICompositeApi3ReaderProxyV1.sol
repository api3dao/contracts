// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../interfaces/IApi3ReaderProxy.sol";

interface ICompositeApi3ReaderProxyV1 is IApi3ReaderProxy {
    error FunctionIsNotSupported();

    error ZeroDenominator();

    function proxy1() external returns (address);

    function proxy2() external returns (address);
}
