import { deployments, ethers, getUnnamedAccounts, network, run } from 'hardhat';

import type { ProxyFactory } from '../src/index';

import { chainsSupportedByDapis } from './data/chain-support.json';

module.exports = async () => {
  const accounts = await getUnnamedAccounts();
  const [deployer] = await ethers.getSigners();

  if (chainsSupportedByDapis.includes(network.name)) {
    const AccessControlRegistry = await deployments.get('AccessControlRegistry');
    await run('verify:verify', {
      address: AccessControlRegistry.address,
    });

    const OwnableCallForwarder = await deployments.get('OwnableCallForwarder');
    await run('verify:verify', {
      address: OwnableCallForwarder.address,
      constructorArguments: [accounts[0]],
    });

    const Api3ServerV1 = await deployments.get('Api3ServerV1');
    await run('verify:verify', {
      address: Api3ServerV1.address,
      constructorArguments: [AccessControlRegistry.address, 'Api3ServerV1 admin', OwnableCallForwarder.address],
    });

    const ProxyFactory = await deployments.get('ProxyFactory');
    await run('verify:verify', {
      address: ProxyFactory.address,
      constructorArguments: [Api3ServerV1.address],
    });

    const proxyFactory = new ethers.Contract(
      ProxyFactory.address,
      ProxyFactory.abi,
      ethers.provider
    ) as unknown as ProxyFactory;
    const nodaryEthUsdDataFeedId = '0x4385954e058fbe6b6a744f32a4f89d67aad099f8fb8b23e7ea8dd366ae88151d';
    const expectedDataFeedProxyAddress = await proxyFactory.computeDataFeedProxyAddress(nodaryEthUsdDataFeedId, '0x');
    await run('verify:verify', {
      address: expectedDataFeedProxyAddress,
      constructorArguments: [Api3ServerV1.address, nodaryEthUsdDataFeedId],
    });
    const ethUsdDapiName = ethers.encodeBytes32String('ETH/USD');
    const expectedDapiProxyAddress = await proxyFactory.computeDapiProxyAddress(ethUsdDapiName, '0x');
    await run('verify:verify', {
      address: expectedDapiProxyAddress,
      constructorArguments: [Api3ServerV1.address, ethers.keccak256(ethUsdDapiName)],
    });
    const testOevBeneficiaryAddress = deployer!.address;
    const expectedDataFeedProxyWithOevAddress = await proxyFactory.computeDataFeedProxyWithOevAddress(
      nodaryEthUsdDataFeedId,
      testOevBeneficiaryAddress,
      '0x'
    );
    await run('verify:verify', {
      address: expectedDataFeedProxyWithOevAddress,
      constructorArguments: [Api3ServerV1.address, nodaryEthUsdDataFeedId, testOevBeneficiaryAddress],
    });
    const expectedDapiProxyWithOevAddress = await proxyFactory.computeDapiProxyWithOevAddress(
      ethUsdDapiName,
      testOevBeneficiaryAddress,
      '0x'
    );
    await run('verify:verify', {
      address: expectedDapiProxyWithOevAddress,
      constructorArguments: [Api3ServerV1.address, ethers.keccak256(ethUsdDapiName), testOevBeneficiaryAddress],
    });
  } else {
    throw new Error(`${network.name} is not supported`);
  }
};
module.exports.tags = ['verify'];
