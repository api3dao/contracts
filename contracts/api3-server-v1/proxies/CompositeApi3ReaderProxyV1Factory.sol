// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "../../vendor/@openzeppelin/contracts@5.0.2/utils/Create2.sol";
import "./CompositeApi3ReaderProxyV1.sol";
import "./interfaces/ICompositeApi3ReaderProxyV1.sol";
import "./interfaces/ICompositeApi3ReaderProxyV1Factory.sol";

/// @title Contract factory that deterministically deploys proxies that read
/// composite data feed proxies
/// @dev The proxies are deployed normally and not cloned to minimize the gas
/// cost overhead while using them to read data feed values
contract CompositeApi3ReaderProxyV1Factory is
    ICompositeApi3ReaderProxyV1Factory
{
    /// @notice Deterministically deploys the CompositeApi3ReaderProxyV1
    /// @dev It is absolutely crucial that the deployer understands the
    /// relationship between the values provided by `proxy1` and `proxy2` and the
    /// selected `calculationType`. Incorrect ordering of `proxy1` and `proxy2`
    /// will lead to an incorrect composite calculation
    /// @param proxy1 First IApi3ReaderProxy contract
    /// @param proxy2 Second IApi3ReaderProxy contract
    /// @param calculationType Type of calculation to perform on proxies
    /// @param metadata Metadata for deterministic deployment
    /// @return compositeApi3ReaderProxyV1Address Proxy address
    function deployCompositeApi3ReaderProxyV1(
        address proxy1,
        address proxy2,
        ICompositeApi3ReaderProxyV1.CalculationType calculationType,
        bytes calldata metadata
    ) external override returns (address compositeApi3ReaderProxyV1Address) {
        require(proxy1 != address(0), "proxy1 address zero");
        require(proxy2 != address(0), "proxy2 address zero");
        require(proxy1 != proxy2, "proxy1 and proxy2 same address");
        compositeApi3ReaderProxyV1Address = address(
            new CompositeApi3ReaderProxyV1{salt: keccak256(metadata)}(
                proxy1,
                proxy2,
                calculationType
            )
        );
        emit DeployedCompositeApi3ReaderProxyV1(
            compositeApi3ReaderProxyV1Address,
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
    /// @return compositeApi3ReaderProxyV1Address Proxy address
    function computeCompositeApi3ReaderProxyV1Address(
        address proxy1,
        address proxy2,
        ICompositeApi3ReaderProxyV1.CalculationType calculationType,
        bytes calldata metadata
    )
        external
        view
        override
        returns (address compositeApi3ReaderProxyV1Address)
    {
        require(proxy1 != address(0), "proxy1 address zero");
        require(proxy2 != address(0), "proxy2 address zero");
        require(proxy1 != proxy2, "proxy1 and proxy2 same address");
        compositeApi3ReaderProxyV1Address = Create2.computeAddress(
            keccak256(metadata),
            keccak256(
                abi.encodePacked(
                    type(CompositeApi3ReaderProxyV1).creationCode,
                    abi.encode(proxy1, proxy2, uint256(calculationType))
                )
            )
        );
    }
}
