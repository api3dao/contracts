import { /* config, */ deployments, ethers, network, run } from 'hardhat';

import {
  chainsSupportedByManagerMultisig,
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
// import { computeApi3MarketAirseekerRegistryAddress } from '../src/index';

module.exports = async () => {
  const EXPECTED_DEPLOYER_ADDRESS = ethers.getAddress('0x07b589f06bD0A5324c4E2376d66d2F4F25921DE1');
  // const MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH = 10;

  if (chainsSupportedByManagerMultisig.includes(network.name)) {
    const GnosisSafeWithoutProxy = await deployments.get('GnosisSafeWithoutProxy');
    await run('verify:verify', {
      address: GnosisSafeWithoutProxy.address,
      constructorArguments: GnosisSafeWithoutProxy.args,
    });

    const OwnableCallForwarder = await deployments.get('OwnableCallForwarder');
    await run('verify:verify', {
      address: OwnableCallForwarder.address,
      constructorArguments: [EXPECTED_DEPLOYER_ADDRESS],
    });

    if (chainsSupportedByDapis.includes(network.name)) {
      const AccessControlRegistry = await deployments.get('AccessControlRegistry');
      await run('verify:verify', {
        address: AccessControlRegistry.address,
      });

      const Api3ServerV1 = await deployments.get('Api3ServerV1');
      await run('verify:verify', {
        address: Api3ServerV1.address,
        constructorArguments: [AccessControlRegistry.address, 'Api3ServerV1 admin', OwnableCallForwarder.address],
      });

      const Api3ServerV1OevExtension = await deployments.get('Api3ServerV1OevExtension');
      await run('verify:verify', {
        address: Api3ServerV1OevExtension.address,
        constructorArguments: [
          AccessControlRegistry.address,
          'Api3ServerV1OevExtension admin',
          OwnableCallForwarder.address,
          Api3ServerV1.address,
        ],
      });

      const Api3ReaderProxyV1Factory = await deployments.get('Api3ReaderProxyV1Factory');
      await run('verify:verify', {
        address: Api3ReaderProxyV1Factory.address,
        constructorArguments: [OwnableCallForwarder.address, Api3ServerV1OevExtension.address],
      });

      if (chainsSupportedByMarket.includes(network.name)) {
        /*
        const Api3Market = await deployments.get('Api3Market');
        await run('verify:verify', {
          address: Api3Market.address,
          constructorArguments: [
            OwnableCallForwarder.address,
            '0x9EB9798Dc1b602067DFe5A57c3bfc914B965acFD',
            MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH,
          ],
        });
        const airseekerRegistryAddress = computeApi3MarketAirseekerRegistryAddress(
          config.networks[network.name]!.chainId!
        );
        await run('verify:verify', {
          address: airseekerRegistryAddress,
          constructorArguments: [Api3Market.address, Api3ServerV1.address],
        });
        */
      }

      if (chainsSupportedByOevAuctions.includes(network.name)) {
        const OevAuctionHouse = await deployments.get('OevAuctionHouse');
        await run('verify:verify', {
          address: OevAuctionHouse.address,
          constructorArguments: [AccessControlRegistry.address, 'OevAuctionHouse admin', OwnableCallForwarder.address],
        });
      }
    }
  } else {
    throw new Error(`${network.name} is not supported`);
  }
};
module.exports.tags = ['verify'];
