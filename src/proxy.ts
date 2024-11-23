import * as ethers from 'ethers';

import { Api3ReaderProxyV1__factory, ERC1967Proxy__factory, deploymentAddresses, DAPPS } from './index';

function computeApi3ReaderProxyV1Address(
  chainId: ethers.BigNumberish,
  dapiName: string,
  dappId: ethers.BigNumberish,
  metadata: ethers.BytesLike
) {
  const api3ReaderProxyV1FactoryAddress =
    deploymentAddresses.Api3ReaderProxyV1Factory[
      chainId.toString() as keyof typeof deploymentAddresses.Api3ReaderProxyV1Factory
    ];
  if (!api3ReaderProxyV1FactoryAddress) {
    throw new Error(`Api3ReaderProxyV1Factory deployment not found for chain with ID ${chainId}`);
  }
  const api3ServerV1OevExtensionAddress =
    deploymentAddresses.Api3ServerV1OevExtension[
      chainId.toString() as keyof typeof deploymentAddresses.Api3ServerV1OevExtension
    ];
  if (!api3ServerV1OevExtensionAddress) {
    throw new Error(`Api3ServerV1OevExtension deployment not found for chain with ID ${chainId}`);
  }
  const implementationAddress = ethers.getCreate2Address(
    api3ReaderProxyV1FactoryAddress,
    ethers.keccak256(metadata),
    ethers.solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        Api3ReaderProxyV1__factory.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'bytes32', 'uint256'],
          [api3ServerV1OevExtensionAddress, ethers.encodeBytes32String(dapiName), dappId]
        ),
      ]
    )
  );
  return ethers.getCreate2Address(
    api3ReaderProxyV1FactoryAddress,
    ethers.keccak256(metadata),
    ethers.solidityPackedKeccak256(
      ['bytes', 'bytes'],
      [
        ERC1967Proxy__factory.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes'], [implementationAddress, '0x']),
      ]
    )
  );
}

function computeCommunalApi3ReaderProxyV1Address(chainId: ethers.BigNumberish, dapiName: string) {
  return computeApi3ReaderProxyV1Address(chainId, dapiName, 1, '0x');
}

function computeDappId(dappAlias: string, chainId: ethers.BigNumberish) {
  if (!DAPPS.some((dapp) => dapp.alias === dappAlias)) {
    throw new Error(`dApp with alias ${dappAlias} not registered to the package`);
  }
  return BigInt(
    ethers.solidityPackedKeccak256(
      ['bytes32', 'uint256'],
      [ethers.solidityPackedKeccak256(['string'], [dappAlias]), chainId]
    )
  );
}

function computeDappSpecificApi3ReaderProxyV1Address(
  dappAlias: string,
  chainId: ethers.BigNumberish,
  dapiName: string
) {
  return computeApi3ReaderProxyV1Address(chainId, dapiName, computeDappId(dappAlias, chainId), '0x');
}

export {
  computeApi3ReaderProxyV1Address,
  computeCommunalApi3ReaderProxyV1Address,
  computeDappId,
  computeDappSpecificApi3ReaderProxyV1Address,
};
