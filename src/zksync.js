const ethers = require('ethers');
const { references } = require('@api3/airnode-protocol-v1');

// We do not want zkSync dependencies in our packages so we derive our own addresses.
// Refer to `getNewAddressCreate2()` of the `ContractDeployer` contract to make sense of the implementation.
// https://github.com/matter-labs/era-system-contracts/blob/857da713d9756ec13f071916848e283e74579817/contracts/ContractDeployer.sol#L90

// https://github.com/matter-labs/era-system-contracts/blob/857da713d9756ec13f071916848e283e74579817/contracts/Constants.sol#L74
const CREATE2_PREFIX = '0x2020dba91b30cc0006188af794c2fb30dd8520db7e2c088b7fc7c103c00ca494';

// According to the zkSync docs, bytecode is hashed using sha256, and then the first two bytes are
// replaced with the length of the bytecode in 32-byte words.
// To verify the hashes below
// - Build https://github.com/api3dao/airnode-protocol-v1/tree/deploy-zksync-reference
// - Get the bytecode from the artifacts
// - Use `utils.hashBytecode()` from the `zksync-web3` package
const bytecodeHashes = {
  DapiProxy: '0x010000718e160c49f26d36ffd29dbe562fcc1ae0c45e3add4ae314721c4cfd50',
  DataFeedProxy: '0x01000071aa077a2b3722b686ce72da1b80c036fe00b90b1b0666cf7472ed7181',
  DapiProxyWithOev: '0x010000833ea8eec6c5a363e8de8e0a9fcd770e93f86d9ec426c1f7886822cb4d',
  DataFeedProxyWithOev: '0x010000832145787c75d77acc93c6b6e61af2909128377978cb54e6f31e139cc0',
};

function confirmChainIdToBelongToZkSync(chainId) {
  if (chainId != 280 && chainId != 324) {
    throw new Error(
      `Attempted to use the zkSync address derivation method on chain with ID ${chainId}, which is not a zkSync chain.`
    );
  }
}

function computeCreate2Address(senderAddress, salt, bytecodeHash, constructorInput) {
  return ethers.utils.getAddress(
    ethers.utils.hexDataSlice(
      ethers.utils.keccak256(
        ethers.utils.hexConcat([
          CREATE2_PREFIX,
          ethers.utils.hexZeroPad(senderAddress, 32),
          salt,
          bytecodeHash,
          ethers.utils.keccak256(constructorInput),
        ])
      ),
      12
    )
  );
}

function computeDapiProxyAddress(chainId, dapiName, metadata) {
  confirmChainIdToBelongToZkSync(chainId);
  const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [ethers.utils.formatBytes32String(dapiName)]);
  return computeCreate2Address(
    references.ProxyFactory[chainId.toString()],
    ethers.utils.keccak256(metadata),
    bytecodeHashes.DapiProxy,
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32'],
      [references.Api3ServerV1[chainId.toString()], dapiNameHash]
    )
  );
}

function computeDapiProxyWithOevAddress(chainId, dapiName, oevBeneficiary, metadata) {
  confirmChainIdToBelongToZkSync(chainId);
  const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [ethers.utils.formatBytes32String(dapiName)]);
  return computeCreate2Address(
    references.ProxyFactory[chainId.toString()],
    ethers.utils.keccak256(metadata),
    bytecodeHashes.DapiProxyWithOev,
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32', 'address'],
      [references.Api3ServerV1[chainId.toString()], dapiNameHash, oevBeneficiary]
    )
  );
}

function computeDataFeedProxyAddress(chainId, dataFeedId, metadata) {
  confirmChainIdToBelongToZkSync(chainId);
  return computeCreate2Address(
    references.ProxyFactory[chainId.toString()],
    ethers.utils.keccak256(metadata),
    bytecodeHashes.DataFeedProxy,
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32'],
      [references.Api3ServerV1[chainId.toString()], dataFeedId]
    )
  );
}

function computeDataFeedProxyWithOevAddress(chainId, dataFeedId, oevBeneficiary, metadata) {
  confirmChainIdToBelongToZkSync(chainId);
  return computeCreate2Address(
    references.ProxyFactory[chainId.toString()],
    ethers.utils.keccak256(metadata),
    bytecodeHashes.DataFeedProxyWithOev,
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32', 'address'],
      [references.Api3ServerV1[chainId.toString()], dataFeedId, oevBeneficiary]
    )
  );
}

module.exports = {
  computeDapiProxyAddress,
  computeDapiProxyWithOevAddress,
  computeDataFeedProxyAddress,
  computeDataFeedProxyWithOevAddress,
};
