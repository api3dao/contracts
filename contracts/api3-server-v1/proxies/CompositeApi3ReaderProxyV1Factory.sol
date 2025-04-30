// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "../../vendor/@openzeppelin/contracts@5.0.2/access/Ownable.sol";
import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/ERC1967/ERC1967Proxy.sol";
import "../../vendor/@openzeppelin/contracts@5.0.2/utils/Create2.sol";
import "./CompositeApi3ReaderProxyV1.sol";
import "./interfaces/ICompositeApi3ReaderProxyV1.sol";
import "./interfaces/ICompositeApi3ReaderProxyV1Factory.sol";

/// @title Factory contract that deploys CompositeApi3ReaderProxyV1
/// implementations and their upgradeable proxies
/// @notice The owner of this contract at the time that it deploys a proxy is
/// set as the owner of the proxy, which is allowed to upgrade it
contract CompositeApi3ReaderProxyV1Factory is
    Ownable,
    ICompositeApi3ReaderProxyV1Factory
{
    /// @param initialOwner Initial owner.
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Deterministically deploys the CompositeApi3ReaderProxyV1
    /// @dev As noted in CompositeApi3ReaderProxyV1, an implementation is
    /// deployed for each proxy to be able to use immutable variables. It is
    /// absolutely crucial that the deployer understands the relationship between
    /// the values provided by `proxy1` and `proxy2` and the selected
    /// `calculationType`. Incorrect ordering of `proxy1` and `proxy2` will lead
    /// to an incorrect composite calculation
    /// @param proxy1 First IApi3ReaderProxy contract
    /// @param proxy2 Second IApi3ReaderProxy contract
    /// @param calculationType Type of calculation to perform on proxies
    /// @param metadata Metadata for deterministic deployment
    /// @return proxy Proxy address
    function deployCompositeApi3ReaderProxyV1(
        address proxy1,
        address proxy2,
        ICompositeApi3ReaderProxyV1.CalculationType calculationType,
        bytes calldata metadata
    ) external override returns (address proxy) {
        require(proxy1 != address(0), "proxy1 address zero");
        require(proxy2 != address(0), "proxy2 address zero");
        require(proxy1 != proxy2, "proxy1 and proxy2 same address");
        // The implementation is guaranteed to not have been deployed earlier
        // if the proxy is not yet deployed. If the proxy is already deployed,
        // we want to revert anyway. Therefore, there is no need to check the
        // case where the implementation is already deployed.
        address implementation = address(
            new CompositeApi3ReaderProxyV1{salt: keccak256(metadata)}(
                proxy1,
                proxy2,
                calculationType
            )
        );
        proxy = address(
            new ERC1967Proxy{salt: keccak256(metadata)}(implementation, "")
        );
        CompositeApi3ReaderProxyV1(proxy).initialize(owner());
        emit DeployedCompositeApi3ReaderProxyV1(
            proxy,
            proxy1,
            proxy2,
            calculationType,
            metadata
        );
    }

    /// @notice Computes the address of the CompositeApi3ReaderProxyV1
    /// @param proxy1 First IApi3ReaderProxy contract
    /// @param proxy2 Second IApi3ReaderProxy contract
    /// @param calculationType Type of calculation to perform on proxies
    /// @param metadata Metadata for deterministic deployment
    /// @return proxy Proxy address
    function computeCompositeApi3ReaderProxyV1Address(
        address proxy1,
        address proxy2,
        ICompositeApi3ReaderProxyV1.CalculationType calculationType,
        bytes calldata metadata
    ) external view returns (address proxy) {
        require(proxy1 != address(0), "proxy1 address zero");
        require(proxy2 != address(0), "proxy2 address zero");
        require(proxy1 != proxy2, "proxy1 and proxy2 same address");
        address implementation = Create2.computeAddress(
            keccak256(metadata),
            keccak256(
                abi.encodePacked(
                    type(CompositeApi3ReaderProxyV1).creationCode,
                    abi.encode(proxy1, proxy2, uint256(calculationType))
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
