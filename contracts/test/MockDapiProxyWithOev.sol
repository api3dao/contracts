// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockDapiProxyWithOev {
    address public immutable api3ServerV1;
    bytes32 public immutable dapiNameHash;
    address public immutable oevBeneficiary;

    constructor(
        address _api3ServerV1,
        bytes32 _dapiNameHash,
        address _oevBeneficiary
    ) {
        api3ServerV1 = _api3ServerV1;
        dapiNameHash = _dapiNameHash;
        oevBeneficiary = _oevBeneficiary;
    }
}
