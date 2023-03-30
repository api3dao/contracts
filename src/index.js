const ethers = require('ethers');
const { references, DapiProxy__factory, DataFeedProxy__factory } = require('@api3/airnode-protocol-v1');
const zkSync = require('./zksync');

function computeDapiProxyAddress(chainId, dapiName, metadata) {
  if (chainId == 280 || chainId == 324) {
    return zkSync.computeDapiProxyAddress(chainId, dapiName, metadata);
  }
  const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [ethers.utils.formatBytes32String(dapiName)]);
  const initcode = ethers.utils.solidityPack(
    ['bytes', 'bytes'],
    [
      DapiProxy__factory.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes32'],
        [references.Api3ServerV1[chainId.toString()], dapiNameHash]
      ),
    ]
  );
  return ethers.utils.getCreate2Address(
    references.ProxyFactory[chainId],
    ethers.utils.keccak256(metadata),
    ethers.utils.keccak256(initcode)
  );
}

function computeDataFeedProxyAddress(chainId, dataFeedId, metadata) {
  if (chainId == 280 || chainId == 324) {
    return zkSync.computeDataFeedProxyAddress(chainId, dataFeedId, metadata);
  }
  const initcode = ethers.utils.solidityPack(
    ['bytes', 'bytes'],
    [
      DataFeedProxy__factory.bytecode,
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes32'],
        [references.Api3ServerV1[chainId.toString()], dataFeedId]
      ),
    ]
  );
  return ethers.utils.getCreate2Address(
    references.ProxyFactory[chainId],
    ethers.utils.keccak256(metadata),
    ethers.utils.keccak256(initcode)
  );
}

module.exports = { references, computeDapiProxyAddress, computeDataFeedProxyAddress };
