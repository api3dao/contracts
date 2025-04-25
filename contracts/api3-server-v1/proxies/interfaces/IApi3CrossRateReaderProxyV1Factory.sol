// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IApi3CrossRateReaderProxyV1.sol";

interface IApi3CrossRateReaderProxyV1Factory {
    event DeployedApi3CrossRateReaderProxyV1(
        address indexed proxy,
        address proxy1,
        address proxy2,
        IApi3CrossRateReaderProxyV1.CalculationType calculationType,
        bytes32 crossRateDapiName,
        bytes metadata
    );

    function deployApi3CrossRateReaderProxyV1(
        address proxy1,
        address proxy2,
        IApi3CrossRateReaderProxyV1.CalculationType calculationType,
        bytes32 crossRateDapiName,
        bytes calldata metadata
    ) external returns (address proxy);

    function computeApi3CrossRateReaderProxyV1Address(
        address proxy1,
        address proxy2,
        IApi3CrossRateReaderProxyV1.CalculationType calculationType,
        bytes32 crossRateDapiName,
        bytes calldata metadata
    ) external view returns (address proxy);
}
