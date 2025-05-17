// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../interfaces/IApi3ReaderProxy.sol";

interface IApi3ReaderProxyV1 is IApi3ReaderProxy {
    error DapiNameIsNotSet();

    error DataFeedIsNotInitialized();

    error FunctionIsNotSupported();

    function initialize(address initialOwner) external;

    function api3ServerV1() external returns (address);

    function api3ServerV1OevExtension() external returns (address);

    function dapiName() external returns (bytes32);

    function dappId() external returns (uint256);
}
