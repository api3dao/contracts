// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDataFeedProxy.sol";
import "../interfaces/IApi3ServerV1.sol";

/// @title An immutable proxy contract that is used to read a specific data
/// feed (Beacon or Beacon set) of a specific Api3ServerV1 contract
/// @notice In an effort to reduce the bytecode of this contract, its
/// constructor arguments are validated by ProxyFactory, rather than
/// internally. If you intend to deploy this contract without using
/// ProxyFactory, you are recommended to implement an equivalent validation.
/// @dev See DapiProxy.sol for comments about usage
contract DataFeedProxy is IDataFeedProxy {
    /// @notice Api3ServerV1 address
    address public immutable override api3ServerV1;
    /// @notice Data feed ID
    bytes32 public immutable override dataFeedId;

    /// @param _api3ServerV1 Api3ServerV1 address
    /// @param _dataFeedId Data feed (Beacon or Beacon set) ID
    constructor(address _api3ServerV1, bytes32 _dataFeedId) {
        api3ServerV1 = _api3ServerV1;
        dataFeedId = _dataFeedId;
    }

    /// @notice Reads the data feed that this proxy maps to
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = IApi3ServerV1(api3ServerV1).readDataFeedWithId(
            dataFeedId
        );
    }
}
