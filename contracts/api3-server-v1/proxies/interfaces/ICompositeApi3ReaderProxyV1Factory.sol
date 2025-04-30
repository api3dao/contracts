// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ICompositeApi3ReaderProxyV1.sol";

interface ICompositeApi3ReaderProxyV1Factory {
    event DeployedCompositeApi3ReaderProxyV1(
        address indexed proxy,
        address proxy1,
        address proxy2,
        ICompositeApi3ReaderProxyV1.CalculationType calculationType,
        bytes32 crossRateDapiName,
        bytes metadata
    );

    function deployCompositeApi3ReaderProxyV1(
        address proxy1,
        address proxy2,
        ICompositeApi3ReaderProxyV1.CalculationType calculationType,
        bytes32 crossRateDapiName,
        bytes calldata metadata
    ) external returns (address proxy);

    function computeCompositeApi3ReaderProxyV1Address(
        address proxy1,
        address proxy2,
        ICompositeApi3ReaderProxyV1.CalculationType calculationType,
        bytes32 crossRateDapiName,
        bytes calldata metadata
    ) external view returns (address proxy);
}
