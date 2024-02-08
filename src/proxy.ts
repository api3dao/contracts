import * as ethers from 'ethers';

import {
  DapiProxy__factory,
  DapiProxyWithOev__factory,
  DataFeedProxy__factory,
  DataFeedProxyWithOev__factory,
  deploymentAddresses,
} from './index';

function getDeploymentAddresses(chainId: ethers.BigNumberish) {
  const api3ServerV1Address =
    deploymentAddresses.Api3ServerV1[chainId.toString() as keyof typeof deploymentAddresses.Api3ServerV1];
  if (!api3ServerV1Address) {
    throw new Error(`Api3ServerV1 deployment not found for chain with ID ${chainId}`);
  }
  const proxyFactoryAddress =
    deploymentAddresses.ProxyFactory[chainId.toString() as keyof typeof deploymentAddresses.ProxyFactory];
  if (!proxyFactoryAddress) {
    throw new Error(`ProxyFactory deployment not found for chain with ID ${chainId}`);
  }
  return { api3ServerV1Address, proxyFactoryAddress };
}

function computeDapiProxyAddress(chainId: ethers.BigNumberish, dapiName: string, metadata: ethers.BytesLike) {
  const { api3ServerV1Address, proxyFactoryAddress } = getDeploymentAddresses(chainId);
  const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [ethers.encodeBytes32String(dapiName)]);
  const initcode = ethers.solidityPacked(
    ['bytes', 'bytes'],
    [
      DapiProxy__factory.bytecode,
      ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes32'], [api3ServerV1Address, dapiNameHash]),
    ]
  );
  return ethers.getCreate2Address(proxyFactoryAddress, ethers.keccak256(metadata), ethers.keccak256(initcode));
}

function computeDapiProxyWithOevAddress(
  chainId: ethers.BigNumberish,
  dapiName: string,
  oevBeneficiary: ethers.AddressLike,
  metadata: ethers.BytesLike
) {
  const { api3ServerV1Address, proxyFactoryAddress } = getDeploymentAddresses(chainId);
  const dapiNameHash = ethers.solidityPackedKeccak256(['bytes32'], [ethers.encodeBytes32String(dapiName)]);
  const initcode = ethers.solidityPacked(
    ['bytes', 'bytes'],
    [
      DapiProxyWithOev__factory.bytecode,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes32', 'address'],
        [api3ServerV1Address, dapiNameHash, oevBeneficiary]
      ),
    ]
  );
  return ethers.getCreate2Address(proxyFactoryAddress, ethers.keccak256(metadata), ethers.keccak256(initcode));
}

function computeDataFeedProxyAddress(
  chainId: ethers.BigNumberish,
  dataFeedId: ethers.BytesLike,
  metadata: ethers.BytesLike
) {
  const { api3ServerV1Address, proxyFactoryAddress } = getDeploymentAddresses(chainId);
  const initcode = ethers.solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      DataFeedProxy__factory.bytecode,
      ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes32'], [api3ServerV1Address, dataFeedId]),
    ]
  );
  return ethers.getCreate2Address(proxyFactoryAddress, ethers.keccak256(metadata), ethers.keccak256(initcode));
}

function computeDataFeedProxyWithOevAddress(
  chainId: ethers.BigNumberish,
  dataFeedId: ethers.BytesLike,
  oevBeneficiary: ethers.AddressLike,
  metadata: ethers.BytesLike
) {
  const { api3ServerV1Address, proxyFactoryAddress } = getDeploymentAddresses(chainId);
  const initcode = ethers.solidityPackedKeccak256(
    ['bytes', 'bytes'],
    [
      DataFeedProxyWithOev__factory.bytecode,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes32', 'address'],
        [api3ServerV1Address, dataFeedId, oevBeneficiary]
      ),
    ]
  );
  return ethers.getCreate2Address(proxyFactoryAddress, ethers.keccak256(metadata), ethers.keccak256(initcode));
}

export {
  computeDapiProxyAddress,
  computeDapiProxyWithOevAddress,
  computeDataFeedProxyAddress,
  computeDataFeedProxyWithOevAddress,
};
