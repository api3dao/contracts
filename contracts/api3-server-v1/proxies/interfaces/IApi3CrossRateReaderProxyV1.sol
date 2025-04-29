// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../interfaces/IApi3ReaderProxy.sol";

interface IApi3CrossRateReaderProxyV1 is IApi3ReaderProxy {
    enum CalculationType {
        Divide1By2,
        Divide2By1,
        Multiply
    }

    error FunctionIsNotSupported();

    error ProxyReturnedZero(address proxy);

    function initialize(address initialOwner) external;

    function proxy1() external returns (address);

    function proxy2() external returns (address);

    function calculationType() external returns (CalculationType);

    function crossRateDapiName() external returns (bytes32);
}
