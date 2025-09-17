import { deployments, ethers, network, run } from 'hardhat';

import { chainsSupportedByMarket, chainsSupportedByOevAuctions } from '../data/chain-support.json';
import { CHAINS } from '../src/generated/chains';
import { Api3ReaderProxyV1__factory, ERC1967Proxy__factory } from '../src/index';

const MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH = 10;

module.exports = async () => {
  if (!chainsSupportedByMarket.includes(network.name)) {
    throw new Error(`${network.name} is not supported`);
  }

  let verifyTask = 'verify:verify';

  const blockExplorerProvider = CHAINS.find((chain) => chain.alias === network.name)?.explorer?.provider;

  switch (blockExplorerProvider) {
    case 'etherscan':
    case 'blockscout':
    case 'sourcify':
      verifyTask = `verify:${blockExplorerProvider}`;
      break;
    case 'other':
      verifyTask = 'verify:blockscout';
      break;
  }

  const GnosisSafeWithoutProxy = await deployments.get('GnosisSafeWithoutProxy');
  await run(verifyTask, {
    address: GnosisSafeWithoutProxy.address,
    constructorArguments: GnosisSafeWithoutProxy.args,
  });

  const OwnableCallForwarder = await deployments.get('OwnableCallForwarder');
  await run(verifyTask, {
    address: OwnableCallForwarder.address,
    constructorArguments: [GnosisSafeWithoutProxy.address],
  });

  const AccessControlRegistry = await deployments.get('AccessControlRegistry');
  await run(verifyTask, {
    address: AccessControlRegistry.address,
  });

  const Api3ServerV1 = await deployments.get('Api3ServerV1');
  await run(verifyTask, {
    address: Api3ServerV1.address,
    constructorArguments: [AccessControlRegistry.address, 'Api3ServerV1 admin', OwnableCallForwarder.address],
  });

  const Api3ServerV1OevExtension = await deployments.get('Api3ServerV1OevExtension');
  await run(verifyTask, {
    address: Api3ServerV1OevExtension.address,
    constructorArguments: [
      AccessControlRegistry.address,
      'Api3ServerV1OevExtension admin',
      OwnableCallForwarder.address,
      Api3ServerV1.address,
    ],
  });

  const Api3ReaderProxyV1Factory = await deployments.get('Api3ReaderProxyV1Factory');
  await run(verifyTask, {
    address: Api3ReaderProxyV1Factory.address,
    constructorArguments: [OwnableCallForwarder.address, Api3ServerV1OevExtension.address],
  });

  const dapiName = ethers.encodeBytes32String('ETH/USD');
  const dappId = 1;
  const api3ReaderProxyV1Metadata = '0x';
  const api3ReaderProxyV1ImplementationInitcode = ethers.solidityPacked(
    ['bytes', 'bytes'],
    [
      Api3ReaderProxyV1__factory.bytecode,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes32', 'uint256'],
        [Api3ServerV1OevExtension.address, dapiName, dappId]
      ),
    ]
  );
  const api3ReaderProxyV1ImplementationAddress = ethers.getCreate2Address(
    Api3ReaderProxyV1Factory.address,
    ethers.keccak256(api3ReaderProxyV1Metadata),
    ethers.keccak256(api3ReaderProxyV1ImplementationInitcode)
  );
  await run(verifyTask, {
    address: api3ReaderProxyV1ImplementationAddress,
    constructorArguments: [Api3ServerV1OevExtension.address, dapiName, dappId],
  });

  const api3ReaderProxyV1Initcode = ethers.solidityPacked(
    ['bytes', 'bytes'],
    [
      ERC1967Proxy__factory.bytecode,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes'],
        [api3ReaderProxyV1ImplementationAddress, api3ReaderProxyV1Metadata]
      ),
    ]
  );
  const api3ReaderProxyV1Address = ethers.getCreate2Address(
    Api3ReaderProxyV1Factory.address,
    ethers.keccak256(api3ReaderProxyV1Metadata),
    ethers.keccak256(api3ReaderProxyV1Initcode)
  );
  await run(verifyTask, {
    address: api3ReaderProxyV1Address,
    constructorArguments: [api3ReaderProxyV1ImplementationAddress, api3ReaderProxyV1Metadata],
  });

  const Api3MarketV2 = await deployments.get('Api3MarketV2');
  await run(verifyTask, {
    address: Api3MarketV2.address,
    constructorArguments: [
      OwnableCallForwarder.address,
      Api3ReaderProxyV1Factory.address,
      MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH,
    ],
  });

  const AirseekerRegistry = await deployments.get('AirseekerRegistry');
  await run(verifyTask, {
    address: AirseekerRegistry.address,
    constructorArguments: [Api3MarketV2.address, Api3ServerV1.address],
  });

  if (chainsSupportedByOevAuctions.includes(network.name)) {
    const OevAuctionHouse = await deployments.get('OevAuctionHouse');
    await run(verifyTask, {
      address: OevAuctionHouse.address,
      constructorArguments: [AccessControlRegistry.address, 'OevAuctionHouse admin', OwnableCallForwarder.address],
    });
  }
};
module.exports.tags = ['verify'];
