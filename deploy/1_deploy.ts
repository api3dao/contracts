import { CHAINS } from '@api3/chains';
import { deployments, ethers, network } from 'hardhat';

import {
  chainsSupportedByManagerMultisig,
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import * as managerMultisigMetadata from '../data/manager-multisig-metadata.json';
import type { Api3ReaderProxyV1Factory, OwnableCallForwarder } from '../src/index';

const MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH = 10;

module.exports = async () => {
  const { deploy, log } = deployments;
  const [deployer] = await ethers.getSigners();

  if (chainsSupportedByManagerMultisig.includes(network.name)) {
    const gnosisSafeWithoutProxy = await deployments.get('GnosisSafeWithoutProxy').catch(async () => {
      log(`Deploying GnosisSafeWithoutProxy`);
      return deploy('GnosisSafeWithoutProxy', {
        args: CHAINS.find((chain) => chain.alias === process.env.NETWORK)?.testnet
          ? [managerMultisigMetadata.testnet.owners, managerMultisigMetadata.testnet.threshold]
          : [managerMultisigMetadata.mainnet.owners, managerMultisigMetadata.mainnet.threshold],
        from: deployer!.address,
        log: true,
        deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
      });
    });

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

    if ((await ownableCallForwarder.owner()) === deployer!.address) {
      const transaction = await ownableCallForwarder.transferOwnership(gnosisSafeWithoutProxy.address);
      await transaction.wait();
      log(`Transferred OwnableCallForwarder ownership to ${gnosisSafeWithoutProxy.address}`);
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

      const api3ServerV1OevExtension = await deployments.get('Api3ServerV1OevExtension').catch(async () => {
        log(`Deploying Api3ServerV1OevExtension`);
        return deploy('Api3ServerV1OevExtension', {
          from: deployer!.address,
          args: [
            accessControlRegistry.address,
            'Api3ServerV1OevExtension admin',
            await ownableCallForwarder.getAddress(),
            api3ServerV1.address,
          ],
          log: true,
          deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
        });
      });

      const { address: api3ReaderProxyV1FactoryAddress, abi: api3ReaderProxyV1FactoryAbi } = await deployments
        .get('Api3ReaderProxyV1Factory')
        .catch(async () => {
          log(`Deploying Api3ReaderProxyV1Factory`);
          return deploy('Api3ReaderProxyV1Factory', {
            from: deployer!.address,
            args: [await ownableCallForwarder.getAddress(), api3ServerV1OevExtension.address],
            log: true,
            deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
          });
        });
      const api3ReaderProxyV1Factory = new ethers.Contract(
        api3ReaderProxyV1FactoryAddress,
        api3ReaderProxyV1FactoryAbi,
        deployer
      ) as unknown as Api3ReaderProxyV1Factory;

      const dapiName = ethers.encodeBytes32String('ETH/USD');
      const dappId = 1;
      const api3ReaderProxyV1Metadata = '0x';
      const expectedApi3ReaderProxyV1Address = await api3ReaderProxyV1Factory.computeApi3ReaderProxyV1Address(
        dapiName,
        dappId,
        api3ReaderProxyV1Metadata
      );
      if ((await ethers.provider.getCode(expectedApi3ReaderProxyV1Address)) === '0x') {
        await api3ReaderProxyV1Factory.deployApi3ReaderProxyV1(dapiName, dappId, api3ReaderProxyV1Metadata);
        log(`Deployed example Api3ReaderProxyV1 at ${expectedApi3ReaderProxyV1Address}`);
      }

      if (chainsSupportedByMarket.includes(network.name)) {
        const api3MarketV2 = await deployments.get('Api3MarketV2').catch(async () => {
          log(`Deploying Api3MarketV2`);
          return deploy('Api3MarketV2', {
            from: deployer!.address,
            args: [
              await ownableCallForwarder.getAddress(),
              api3ReaderProxyV1FactoryAddress,
              MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH,
            ],
            log: true,
            deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
          });
        });

        await deployments.get('AirseekerRegistry').catch(async () => {
          log(`Deploying AirseekerRegistry`);
          return deploy('AirseekerRegistry', {
            from: deployer!.address,
            args: [api3MarketV2.address, api3ServerV1.address],
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
