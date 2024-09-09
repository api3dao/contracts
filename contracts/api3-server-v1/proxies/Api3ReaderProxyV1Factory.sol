// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "../../vendor/@openzeppelin/contracts@5.0.2/access/Ownable.sol";
import "./interfaces/IApi3ReaderProxyV1Factory.sol";
import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/ERC1967/ERC1967Proxy.sol";
import "../../vendor/@openzeppelin/contracts@5.0.2/utils/Create2.sol";
import "./Api3ReaderProxyV1.sol";

/// @title Factory contract that deploys Api3ReaderProxyV1 implementations and
/// their upgradeable proxies
/// @notice The owner of this contract at the time that it deploys a proxy is
/// set as the owner of the proxy, which is allowed to upgrade it
contract Api3ReaderProxyV1Factory is Ownable, IApi3ReaderProxyV1Factory {
    /// @notice Api3ServerV1OevExtension contract address
    address public immutable override api3ServerV1OevExtension;

    /// @param initialOwner Initial owner
    /// @param api3ServerV1OevExtension_ Api3ServerV1OevExtension contract
    /// address
    constructor(
        address initialOwner,
        address api3ServerV1OevExtension_
    ) Ownable(initialOwner) {
        require(
            api3ServerV1OevExtension_ != address(0),
            "Api3ServerV1OevExtension address zero"
        );
        api3ServerV1OevExtension = api3ServerV1OevExtension_;
    }

    /// @notice Deterministically deploys the Api3ReaderProxyV1
    /// @dev As noted in Api3ReaderProxyV1, an implementation is deployed for
    /// each proxy to be able to use immutable variables
    /// @param dapiName dAPI name as a bytes32 string
    /// @param dappId dApp ID
    /// @param metadata Metadata
    /// @return proxy Proxy address
    function deployApi3ReaderProxyV1(
        bytes32 dapiName,
        uint256 dappId,
        bytes calldata metadata
    ) external override returns (address proxy) {
        require(dapiName != bytes32(0), "dAPI name zero");
        require(dappId != 0, "dApp ID zero");
        // The implementation is guaranteed to not have been deployed earlier
        // if the proxy is not yet deployed. If the proxy is already deployed,
        // we want to revert anyway. Therefore, there is no need to check the
        // case where the implementation is already deployed.
        address implementation = address(
            new Api3ReaderProxyV1{salt: keccak256(metadata)}(
                api3ServerV1OevExtension,
                dapiName,
                dappId
            )
        );
        proxy = address(
            new ERC1967Proxy{salt: keccak256(metadata)}(implementation, "")
        );
        Api3ReaderProxyV1(proxy).initialize(owner());
        emit DeployedApi3ReaderProxyV1(proxy, dapiName, dappId, metadata);
    }

    /// @notice Computes the address of the Api3ReaderProxyV1
    /// @param dapiName dAPI name as a bytes32 string
    /// @param dappId dApp ID
    /// @param metadata Metadata
    /// @return proxy Proxy address
    function computeApi3ReaderProxyV1Address(
        bytes32 dapiName,
        uint256 dappId,
        bytes calldata metadata
    ) external view override returns (address proxy) {
        require(dapiName != bytes32(0), "dAPI name zero");
        require(dappId != 0, "dApp ID zero");
        address implementation = Create2.computeAddress(
            keccak256(metadata),
            keccak256(
                abi.encodePacked(
                    type(Api3ReaderProxyV1).creationCode,
                    abi.encode(api3ServerV1OevExtension, dapiName, dappId)
                )
            )
        );
        proxy = Create2.computeAddress(
            keccak256(metadata),
            keccak256(
                abi.encodePacked(
                    type(ERC1967Proxy).creationCode,
                    abi.encode(implementation, bytes(""))
                )
            )
        );
    }
}
