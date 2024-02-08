import * as ethers from 'ethers';

import { AirseekerRegistry__factory, deploymentAddresses } from './index';

function getDeploymentAddresses(chainId: ethers.BigNumberish) {
  const api3MarketAddress =
    deploymentAddresses.Api3Market[chainId.toString() as keyof typeof deploymentAddresses.Api3Market];
  if (!api3MarketAddress) {
    throw new Error(`Api3Market deployment not found for chain with ID ${chainId}`);
  }
  const api3ServerV1Address =
    deploymentAddresses.Api3ServerV1[chainId.toString() as keyof typeof deploymentAddresses.Api3ServerV1];
  if (!api3ServerV1Address) {
    throw new Error(`Api3ServerV1 deployment not found for chain with ID ${chainId}`);
  }
  return { api3MarketAddress, api3ServerV1Address };
}

function computeApi3MarketAirseekerRegistryAddress(chainId: ethers.BigNumberish) {
  const { api3MarketAddress, api3ServerV1Address } = getDeploymentAddresses(chainId);
  const initcode = ethers.solidityPacked(
    ['bytes', 'bytes'],
    [
      AirseekerRegistry__factory.bytecode,
      ethers.AbiCoder.defaultAbiCoder().encode(['address', 'address'], [api3MarketAddress, api3ServerV1Address]),
    ]
  );
  return ethers.getCreate2Address(api3MarketAddress, ethers.ZeroHash, ethers.keccak256(initcode));
}

export { computeApi3MarketAirseekerRegistryAddress };
