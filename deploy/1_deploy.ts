import { CHAINS } from '@api3/chains';
import { deployments, ethers, network } from 'hardhat';

import {
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import managerMultisigAddresses from '../data/manager-multisig.json';
import type { OwnableCallForwarder, ProxyFactory } from '../src/index';

module.exports = async () => {
  const { deploy, log } = deployments;
  const [deployer] = await ethers.getSigners();
  const MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH = 10;

  if (Object.keys(managerMultisigAddresses).includes(network.name)) {
    const { address: ownableCallForwarderAddress, abi: ownableCallForwarderAbi } = await deployments
      .get('OwnableCallForwarder')
      .catch(async () => {
        log(`Deploying OwnableCallForwarder`);
        return deploy('OwnableCallForwarder', {
          from: deployer!.address,
          args: [deployer!.address],
          log: true,
          deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
        });
      });
    const ownableCallForwarder = new ethers.Contract(
      ownableCallForwarderAddress,
      ownableCallForwarderAbi,
      deployer
    ) as unknown as OwnableCallForwarder;

    const managerMultisigAddress = managerMultisigAddresses[network.name as keyof typeof managerMultisigAddresses];
    if ((await ownableCallForwarder.owner()) === deployer!.address) {
      const transaction = await ownableCallForwarder.transferOwnership(managerMultisigAddress);
      await transaction.wait();
      log(`Transferred OwnableCallForwarder ownership to ${managerMultisigAddress}`);
    }

    if (chainsSupportedByDapis.includes(network.name)) {
      const accessControlRegistry = await deployments.get('AccessControlRegistry').catch(async () => {
        log(`Deploying AccessControlRegistry`);
        return deploy('AccessControlRegistry', {
          from: deployer!.address,
          log: true,
          deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
        });
      });

      const api3ServerV1 = await deployments.get('Api3ServerV1').catch(async () => {
        log(`Deploying Api3ServerV1`);
        return deploy('Api3ServerV1', {
          from: deployer!.address,
          args: [accessControlRegistry.address, 'Api3ServerV1 admin', await ownableCallForwarder.getAddress()],
          log: true,
          deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
        });
      });

      const { address: proxyFactoryAddress, abi: proxyFactoryAbi } = await deployments
        .get('ProxyFactory')
        .catch(async () => {
          log(`Deploying ProxyFactory`);
          return deploy('ProxyFactory', {
            from: deployer!.address,
            args: [api3ServerV1.address],
            log: true,
            deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
          });
        });
      const proxyFactory = new ethers.Contract(
        proxyFactoryAddress,
        proxyFactoryAbi,
        deployer
      ) as unknown as ProxyFactory;

      const nodaryEthUsdDataFeedId = '0x4385954e058fbe6b6a744f32a4f89d67aad099f8fb8b23e7ea8dd366ae88151d';
      const expectedDataFeedProxyAddress = await proxyFactory.computeDataFeedProxyAddress(nodaryEthUsdDataFeedId, '0x');
      if ((await ethers.provider.getCode(expectedDataFeedProxyAddress)) === '0x') {
        await proxyFactory.deployDataFeedProxy(nodaryEthUsdDataFeedId, '0x');
        log(`Deployed example DataFeedProxy at ${expectedDataFeedProxyAddress}`);
      }
      const ethUsdDapiName = ethers.encodeBytes32String('ETH/USD');
      const expectedDapiProxyAddress = await proxyFactory.computeDapiProxyAddress(ethUsdDapiName, '0x');
      if ((await ethers.provider.getCode(expectedDapiProxyAddress)) === '0x') {
        await proxyFactory.deployDapiProxy(ethUsdDapiName, '0x');
        log(`Deployed example DapiProxy at ${expectedDapiProxyAddress}`);
      }
      const exampleOevBeneficiaryAddress = deployer!.address;
      const expectedDataFeedProxyWithOevAddress = await proxyFactory.computeDataFeedProxyWithOevAddress(
        nodaryEthUsdDataFeedId,
        exampleOevBeneficiaryAddress,
        '0x'
      );
      if ((await ethers.provider.getCode(expectedDataFeedProxyWithOevAddress)) === '0x') {
        await proxyFactory.deployDataFeedProxyWithOev(nodaryEthUsdDataFeedId, exampleOevBeneficiaryAddress, '0x');
        log(`Deployed example DataFeedProxyWithOev at ${expectedDataFeedProxyWithOevAddress}`);
      }
      const expectedDapiProxyWithOevAddress = await proxyFactory.computeDapiProxyWithOevAddress(
        ethUsdDapiName,
        exampleOevBeneficiaryAddress,
        '0x'
      );
      if ((await ethers.provider.getCode(expectedDapiProxyWithOevAddress)) === '0x') {
        await proxyFactory.deployDapiProxyWithOev(ethUsdDapiName, exampleOevBeneficiaryAddress, '0x');
        log(`Deployed example DapiProxyWithOev at ${expectedDapiProxyWithOevAddress}`);
      }

      if (chainsSupportedByMarket.includes(network.name)) {
        const isTestnet = !CHAINS.find((chain) => chain.alias === network.name)?.testnet;
        if (!isTestnet) {
          await deployments.get('ExternalMulticallSimulator').catch(async () => {
            log(`Deploying ExternalMulticallSimulator`);
            return deploy('ExternalMulticallSimulator', {
              from: deployer!.address,
              log: true,
              deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
            });
          });
        }

        await deployments.get('Api3Market').catch(async () => {
          log(`Deploying Api3Market`);
          return deploy('Api3Market', {
            from: deployer!.address,
            args: [await ownableCallForwarder.getAddress(), proxyFactoryAddress, MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH],
            log: true,
            deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
          });
        });
      }

      if (chainsSupportedByOevAuctions.includes(network.name)) {
        await deployments.get('OevAuctionHouse').catch(async () => {
          log(`Deploying OevAuctionHouse`);
          return deploy('OevAuctionHouse', {
            from: deployer!.address,
            args: [accessControlRegistry.address, 'OevAuctionHouse admin', await ownableCallForwarder.getAddress()],
            log: true,
            deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
          });
        });
      }
    }
  } else {
    throw new Error(`${network.name} is not supported`);
  }
};
module.exports.tags = ['deploy'];
