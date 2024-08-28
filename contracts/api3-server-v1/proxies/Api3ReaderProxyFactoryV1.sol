// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../../vendor/@openzeppelin/contracts@5.0.2/access/Ownable.sol";
import "../../vendor/@openzeppelin/contracts@5.0.2/proxy/ERC1967/ERC1967Proxy.sol";
import "./Api3ReaderProxyV1.sol";

contract Api3ReaderProxyFactoryV1 is Ownable {
    address public immutable api3ServerV1;
    address public immutable api3ServerV1OevExtension;

    constructor(
        address initialOwner,
        address api3ServerV1_,
        address api3ServerV1OevExtension_
    ) Ownable(initialOwner) {
        api3ServerV1 = api3ServerV1_;
        api3ServerV1OevExtension = api3ServerV1OevExtension_;
    }

    function deployDapiProxyUpgradeable(
        bytes32 dapiName,
        uint256 dappId
    ) external returns (address proxy) {
        address implementation = address(
            new Api3ReaderProxyV1{salt: bytes32(0)}(
                owner(),
                api3ServerV1,
                api3ServerV1OevExtension,
                dapiName,
                dappId
            )
        );
        proxy = address(new ERC1967Proxy{salt: bytes32(0)}(implementation, ""));
    }
}
