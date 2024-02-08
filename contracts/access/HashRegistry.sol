// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../vendor/@openzeppelin/contracts@4.9.5/access/Ownable.sol";
import "./interfaces/IHashRegistry.sol";
import "../vendor/@openzeppelin/contracts@4.9.5/utils/cryptography/ECDSA.sol";

/// @title A contract where a value for each hash type can be registered using
/// the signatures of the respective signers that are set by the contract owner
/// @notice Hashes are identified by a unique "hash type", which is a `bytes32`
/// type that can be determined based on any arbitrary convention. The contract
/// owner can set a list of signers for each hash type. For a hash value to be
/// registered, its signers must be set by the contract owner, and valid
/// signatures by each signer must be provided. The hash values are bundled
/// with timestamps that act as nonces, meaning that each registration must
/// be with a larger timestamp than the previous. The contract owner can
/// override previously registered hashes.
/// A signer can sign a delegation message that allows the delegate to sign
/// hashes on their behalf across all instances of this contract until the
/// specified time. This delegation is irrevocable by design (as revoking across
/// all instances would be error-prone). To undo an unwanted delegation, the
/// signer must be swapped out by the contract owner until the delegation runs
/// out.
/// @dev This contract can be used in standalone form to be referred to through
/// external calls, or inherited by the contract that will access the
/// registered hashes internally.
/// HashRegistry is intended for use-cases where signatures and delegations
/// need to apply universally across domains, which is why it is blind to the
/// domain (unlike ERC-712). However, the inheriting contract can implement the
/// type hashes to be domain-specific.
contract HashRegistry is Ownable, IHashRegistry {
    struct Hash {
        bytes32 value;
        uint256 timestamp;
    }

    /// @notice Hash type to the last registered value and timestamp
    mapping(bytes32 => Hash) public override hashes;

    /// @notice Hash type to the hash of the array of signer addresses
    mapping(bytes32 => bytes32) public override hashTypeToSignersHash;

    uint256 private constant ECDSA_SIGNATURE_LENGTH = 65;

    // Length of abi.encode(uint256, bytes, bytes), where the bytes types are
    // ECDSA signatures padded to the next largest multiple of 32 bytes, which
    // is 96
    uint256 private constant DELEGATED_SIGNATURE_LENGTH =
        32 + 32 + 32 + (32 + 96) + (32 + 96);

    /// @param owner_ Owner address
    constructor(address owner_) {
        require(owner_ != address(0), "Owner address zero");
        _transferOwnership(owner_);
    }

    /// @notice Returns the owner address
    /// @return Owner address
    function owner()
        public
        view
        virtual
        override(Ownable, IOwnable)
        returns (address)
    {
        return super.owner();
    }

    /// @notice Called by the owner to renounce the ownership of the contract
    function renounceOwnership() public virtual override(Ownable, IOwnable) {
        return super.renounceOwnership();
    }

    /// @notice Called by the owner to transfer the ownership of the contract
    /// @param newOwner New owner address
    function transferOwnership(
        address newOwner
    ) public virtual override(Ownable, IOwnable) {
        return super.transferOwnership(newOwner);
    }

    /// @notice Called by the contract owner to set signers for a hash type.
    /// The signer addresses must be in ascending order.
    /// @param hashType Hash type
    /// @param signers Signer addresses
    function setSigners(
        bytes32 hashType,
        address[] calldata signers
    ) external override onlyOwner {
        require(hashType != bytes32(0), "Hash type zero");
        uint256 signersCount = signers.length;
        require(signersCount != 0, "Signers empty");
        require(signers[0] != address(0), "First signer address zero");
        for (uint256 ind = 1; ind < signersCount; ind++) {
            require(
                signers[ind] > signers[ind - 1],
                "Signers not in ascending order"
            );
        }
        hashTypeToSignersHash[hashType] = keccak256(abi.encodePacked(signers));
        emit SetSigners(hashType, signers);
    }

    /// @notice Called by the owner to set a hash. Overrides previous
    /// registrations and is allowed to set the value to `bytes32(0)`.
    /// @param hashType Hash type
    /// @param hashValue Hash value
    function setHash(
        bytes32 hashType,
        bytes32 hashValue
    ) external override onlyOwner {
        hashes[hashType] = Hash({value: hashValue, timestamp: block.timestamp});
        emit SetHash(hashType, hashValue, block.timestamp);
    }

    /// @notice Registers the hash value and timestamp for the respective type.
    /// The hash value cannot be zero.
    /// The timestamp must not exceed the block timestamp, yet be larger than
    /// the timestamp of the previous registration.
    /// The signers must have been set for the hash type, and the signatures
    /// must be sorted for the respective signer addresses to be in ascending
    /// order.
    /// Each signature can either be a standalone signature by the respective
    /// signer, or a signature by the signer's delegate, encoded along with
    /// the delegation end timestamp and delegation signature.
    /// @param hashType Hash type
    /// @param hashValue Hash value
    /// @param hashTimestamp Hash timestamp
    /// @param signatures Signatures
    function registerHash(
        bytes32 hashType,
        bytes32 hashValue,
        uint256 hashTimestamp,
        bytes[] calldata signatures
    ) external override {
        require(hashValue != bytes32(0), "Hash value zero");
        require(hashTimestamp <= block.timestamp, "Hash timestamp from future");
        require(
            hashTimestamp > hashes[hashType].timestamp,
            "Hash timestamp not more recent"
        );
        bytes32 signersHash = hashTypeToSignersHash[hashType];
        require(signersHash != bytes32(0), "Signers not set");
        uint256 signaturesCount = signatures.length;
        address[] memory signers = new address[](signaturesCount);
        bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(
            keccak256(abi.encodePacked(hashType, hashValue, hashTimestamp))
        );
        for (uint256 ind = 0; ind < signaturesCount; ind++) {
            uint256 signatureLength = signatures[ind].length;
            if (signatureLength == ECDSA_SIGNATURE_LENGTH) {
                signers[ind] = ECDSA.recover(
                    ethSignedMessageHash,
                    signatures[ind]
                );
            } else if (signatureLength == DELEGATED_SIGNATURE_LENGTH) {
                (
                    uint256 delegationEndTimestamp,
                    bytes memory delegationSignature,
                    bytes memory hashSignature
                ) = abi.decode(signatures[ind], (uint256, bytes, bytes));
                require(
                    block.timestamp < delegationEndTimestamp,
                    "Delegation ended"
                );
                signers[ind] = ECDSA.recover(
                    ECDSA.toEthSignedMessageHash(
                        keccak256(
                            abi.encodePacked(
                                signatureDelegationHashType(),
                                ECDSA.recover(
                                    ethSignedMessageHash,
                                    hashSignature
                                ),
                                delegationEndTimestamp
                            )
                        )
                    ),
                    delegationSignature
                );
            } else {
                revert("Invalid signature length");
            }
        }
        require(
            signersHash == keccak256(abi.encodePacked(signers)),
            "Signature mismatch"
        );
        hashes[hashType] = Hash({value: hashValue, timestamp: hashTimestamp});
        emit RegisteredHash(hashType, hashValue, hashTimestamp);
    }

    /// @notice Returns the signature delegation hash type used in delegation
    /// signatures
    /// @dev Delegation signatures signed with a signature delegation hash type
    /// will apply universally across all HashRegistry instances that use that
    /// same signature delegation hash type. The inheriting contract can
    /// specify a special signature delegation hash type by overriding this
    /// function.
    /// @return Signature delegation hash type
    function signatureDelegationHashType()
        public
        view
        virtual
        override
        returns (bytes32)
    {
        return keccak256(abi.encodePacked("HashRegistry signature delegation"));
    }

    /// @notice Returns get the hash value for the type
    /// @param hashType Hash type
    /// @return hashValue Hash value
    function getHashValue(
        bytes32 hashType
    ) external view override returns (bytes32 hashValue) {
        hashValue = hashes[hashType].value;
    }
}
