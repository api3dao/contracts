import { deployments, ethers, network } from 'hardhat';

import {
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import managerMultisigAddresses from '../data/manager-multisig.json';
import type { OwnableCallForwarder } from '../src/index';

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

      await deployments.get('Api3ServerV1').catch(async () => {
        log(`Deploying Api3ServerV1`);
        return deploy('Api3ServerV1', {
          from: deployer!.address,
          args: [accessControlRegistry.address, 'Api3ServerV1 admin', await ownableCallForwarder.getAddress()],
          log: true,
          deterministicDeployment: process.env.DETERMINISTIC ? ethers.ZeroHash : '',
        });
      });

      if (chainsSupportedByMarket.includes(network.name)) {
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
