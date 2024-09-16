import { CHAINS } from '@api3/chains';
import { deployments, ethers, network } from 'hardhat';

import {
  chainsSupportedByManagerMultisig,
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import * as managerMultisigMetadata from '../data/manager-multisig-metadata.json';
import type { OwnableCallForwarder } from '../src/index';

module.exports = async () => {
  const { deploy, log } = deployments;
  const [deployer] = await ethers.getSigners();
  // const MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH = 10;

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

      await deployments.get('Api3ServerV1OevExtension').catch(async () => {
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

      if (chainsSupportedByMarket.includes(network.name)) {
        /*
        await deployments.get('Api3Market').catch(async () => {
          log(`Deploying Api3Market`);
          return deploy('Api3Market', {
            from: deployer!.address,
            args: [
              await ownableCallForwarder.getAddress(),
              '0x9EB9798Dc1b602067DFe5A57c3bfc914B965acFD',
              MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH,
            ],
            log: true,
            deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
          });
        });
        */
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
