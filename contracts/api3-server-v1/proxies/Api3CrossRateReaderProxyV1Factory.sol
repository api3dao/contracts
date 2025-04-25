// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "../../vendor/@openzeppelin/contracts@5.0.2/access/Ownable.sol";
import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/ERC1967/ERC1967Proxy.sol";
import "../../vendor/@openzeppelin/contracts@5.0.2/utils/Create2.sol";
import "./Api3CrossRateReaderProxyV1.sol";
import "./interfaces/IApi3CrossRateReaderProxyV1.sol";
import "./interfaces/IApi3CrossRateReaderProxyV1Factory.sol";

/// @title Factory contract that deploys Api3CrossRateReaderProxyV1
/// implementations and their upgradeable proxies
/// @notice The owner of this contract at the time that it deploys a proxy is
/// set as the owner of the proxy, which is allowed to upgrade it
contract Api3CrossRateReaderProxyV1Factory is
    Ownable,
    IApi3CrossRateReaderProxyV1Factory
{
    /// @param initialOwner Initial owner.
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Deterministically deploys the Api3CrossRateReaderProxyV1
    /// @dev As noted in Api3CrossRateReaderProxyV1, an implementation is
    /// deployed for each proxy to be able to use immutable variables. It is
    /// absolutely crucial that the deployer understands the relationship between
    /// the values provided by `proxy1` and `proxy2` and the selected
    /// `calculationType`. Incorrect ordering of `proxy1` and `proxy2` will lead
    /// to an incorrect cross-rate calculation
    /// @param proxy1 First IApi3ReaderProxy contract
    /// @param proxy2 Second IApi3ReaderProxy contract
    /// @param calculationType Type of calculation to perform on proxies
    /// @param crossRateDapiName The derived dAPI name of the cross rate
    /// @param metadata Metadata for deterministic deployment
    /// @return proxy Proxy address
    function deployApi3CrossRateReaderProxyV1(
        address proxy1,
        address proxy2,
        IApi3CrossRateReaderProxyV1.CalculationType calculationType,
        bytes32 crossRateDapiName,
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
            new Api3CrossRateReaderProxyV1{salt: keccak256(metadata)}(
                proxy1,
                proxy2,
                calculationType,
                crossRateDapiName
            )
        );
        proxy = address(
            new ERC1967Proxy{salt: keccak256(metadata)}(implementation, "")
        );
        Api3CrossRateReaderProxyV1(proxy).initialize(owner());
        emit DeployedApi3CrossRateReaderProxyV1(
            proxy,
            proxy1,
            proxy2,
            calculationType,
            crossRateDapiName,
            metadata
        );
    }

    /// @notice Computes the address of the Api3CrossRateReaderProxyV1
    /// @param proxy1 First IApi3ReaderProxy contract
    /// @param proxy2 Second IApi3ReaderProxy contract
    /// @param calculationType Type of calculation to perform on proxies
    /// @param crossRateDapiName The derived dAPI name of the cross rate
    /// @param metadata Metadata for deterministic deployment
    /// @return proxy Proxy address
    function computeApi3CrossRateReaderProxyV1Address(
        address proxy1,
        address proxy2,
        IApi3CrossRateReaderProxyV1.CalculationType calculationType,
        bytes32 crossRateDapiName,
        bytes calldata metadata
    ) external view returns (address proxy) {
        require(proxy1 != address(0), "proxy1 address zero");
        require(proxy2 != address(0), "proxy2 address zero");
        require(proxy1 != proxy2, "proxy1 and proxy2 same address");
        address implementation = Create2.computeAddress(
            keccak256(metadata),
            keccak256(
                abi.encodePacked(
                    type(Api3CrossRateReaderProxyV1).creationCode,
                    abi.encode(
                        proxy1,
                        proxy2,
                        uint256(calculationType),
                        crossRateDapiName
                    )
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
