// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IOwnable.sol";

interface IHashRegistry is IOwnable {
    event SetSigners(bytes32 indexed hashType, address[] signers);

    event SetHash(
        bytes32 indexed hashType,
        bytes32 hashValue,
        uint256 hashTimestamp
    );

    event RegisteredHash(
        bytes32 indexed hashType,
        bytes32 hashValue,
        uint256 hashTimestamp
    );

    function setSigners(bytes32 hashType, address[] calldata signers) external;

    function setHash(bytes32 hashType, bytes32 hashValue) external;

    function registerHash(
        bytes32 hashType,
        bytes32 hashValue,
        uint256 hashTimestamp,
        bytes[] calldata signatures
    ) external;

    function signatureDelegationHashType() external view returns (bytes32);

    function getHashValue(
        bytes32 hashType
    ) external view returns (bytes32 hashValue);

    function hashes(
        bytes32 hashType
    ) external view returns (bytes32 hashValue, uint256 hashTimestamp);

    function hashTypeToSignersHash(
        bytes32 hashType
    ) external view returns (bytes32 signersHash);
}
