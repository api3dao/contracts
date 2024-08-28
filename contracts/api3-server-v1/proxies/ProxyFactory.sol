// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DataFeedProxy.sol";
import "./DapiProxy.sol";
import "./DataFeedProxyWithOev.sol";
import "./DapiProxyWithOev.sol";
import "./interfaces/IProxyFactory.sol";
import "../../vendor/@openzeppelin/contracts@4.8.2/utils/Create2.sol";

/// @title Contract factory that deterministically deploys proxies that read
/// data feeds (Beacons or Beacon sets) or dAPIs, along with optional OEV
/// support
/// @dev The proxies are deployed normally and not cloned to minimize the gas
/// cost overhead while using them to read data feed values
contract ProxyFactory is IProxyFactory {
    /// @notice Api3ServerV1 address
    address public immutable override api3ServerV1;

    /// @param _api3ServerV1 Api3ServerV1 address
    constructor(address _api3ServerV1) {
        require(_api3ServerV1 != address(0), "Api3ServerV1 address zero");
        api3ServerV1 = _api3ServerV1;
    }

    /// @notice Deterministically deploys a data feed proxy
    /// @param dataFeedId Data feed ID
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function deployDataFeedProxy(
        bytes32 dataFeedId,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        proxyAddress = address(
            new DataFeedProxy{salt: keccak256(metadata)}(
                api3ServerV1,
                dataFeedId
            )
        );
        emit DeployedDataFeedProxy(proxyAddress, dataFeedId, metadata);
    }

    /// @notice Deterministically deploys a dAPI proxy
    /// @param dapiName dAPI name
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function deployDapiProxy(
        bytes32 dapiName,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        require(dapiName != bytes32(0), "dAPI name zero");
        proxyAddress = address(
            new DapiProxy{salt: keccak256(metadata)}(
                api3ServerV1,
                keccak256(abi.encodePacked(dapiName))
            )
        );
        emit DeployedDapiProxy(proxyAddress, dapiName, metadata);
    }

    /// @notice Deterministically deploys a data feed proxy with OEV support
    /// @param dataFeedId Data feed ID
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function deployDataFeedProxyWithOev(
        bytes32 dataFeedId,
        address oevBeneficiary,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        require(oevBeneficiary != address(0), "OEV beneficiary zero");
        proxyAddress = address(
            new DataFeedProxyWithOev{salt: keccak256(metadata)}(
                api3ServerV1,
                dataFeedId,
                oevBeneficiary
            )
        );
        emit DeployedDataFeedProxyWithOev(
            proxyAddress,
            dataFeedId,
            oevBeneficiary,
            metadata
        );
    }

    /// @notice Deterministically deploys a dAPI proxy with OEV support
    /// @param dapiName dAPI name
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function deployDapiProxyWithOev(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        require(dapiName != bytes32(0), "dAPI name zero");
        require(oevBeneficiary != address(0), "OEV beneficiary zero");
        proxyAddress = address(
            new DapiProxyWithOev{salt: keccak256(metadata)}(
                api3ServerV1,
                keccak256(abi.encodePacked(dapiName)),
                oevBeneficiary
            )
        );
        emit DeployedDapiProxyWithOev(
            proxyAddress,
            dapiName,
            oevBeneficiary,
            metadata
        );
    }

    /// @notice Computes the address of the data feed proxy
    /// @param dataFeedId Data feed ID
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function computeDataFeedProxyAddress(
        bytes32 dataFeedId,
        bytes calldata metadata
    ) external view override returns (address proxyAddress) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        proxyAddress = Create2.computeAddress(
            keccak256(metadata),
            keccak256(
                abi.encodePacked(
                    type(DataFeedProxy).creationCode,
                    abi.encode(api3ServerV1, dataFeedId)
                )
            )
        );
    }

    /// @notice Computes the address of the dAPI proxy
    /// @param dapiName dAPI name
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function computeDapiProxyAddress(
        bytes32 dapiName,
        bytes calldata metadata
    ) external view override returns (address proxyAddress) {
        require(dapiName != bytes32(0), "dAPI name zero");
        proxyAddress = Create2.computeAddress(
            keccak256(metadata),
            keccak256(
                abi.encodePacked(
                    type(DapiProxy).creationCode,
                    abi.encode(
                        api3ServerV1,
                        keccak256(abi.encodePacked(dapiName))
                    )
                )
            )
        );
    }

    /// @notice Computes the address of the data feed proxy with OEV support
    /// @param dataFeedId Data feed ID
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function computeDataFeedProxyWithOevAddress(
        bytes32 dataFeedId,
        address oevBeneficiary,
        bytes calldata metadata
    ) external view override returns (address proxyAddress) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        require(oevBeneficiary != address(0), "OEV beneficiary zero");
        proxyAddress = Create2.computeAddress(
            keccak256(metadata),
            keccak256(
                abi.encodePacked(
                    type(DataFeedProxyWithOev).creationCode,
                    abi.encode(api3ServerV1, dataFeedId, oevBeneficiary)
                )
            )
        );
    }

    /// @notice Computes the address of the dAPI proxy with OEV support
    /// @param dapiName dAPI name
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function computeDapiProxyWithOevAddress(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external view override returns (address proxyAddress) {
        require(dapiName != bytes32(0), "dAPI name zero");
        require(oevBeneficiary != address(0), "OEV beneficiary zero");
        proxyAddress = Create2.computeAddress(
            keccak256(metadata),
            keccak256(
                abi.encodePacked(
                    type(DapiProxyWithOev).creationCode,
                    abi.encode(
                        api3ServerV1,
                        keccak256(abi.encodePacked(dapiName)),
                        oevBeneficiary
                    )
                )
            )
        );
    }
}
