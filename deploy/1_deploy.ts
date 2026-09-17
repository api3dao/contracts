import type { Abi } from '@rocketh/deploy';
import { BrowserProvider, encodeBytes32String } from 'ethers';
import type { DeploymentConstruction } from 'rocketh/types';

import chainSupportData from '../data/chain-support.json' with { type: 'json' };
import managerMultisigMetadata from '../data/manager-multisig-metadata.json' with { type: 'json' };
import { artifacts, deployScript } from '../rocketh/deploy.js';
import { Api3ReaderProxyV1Factory__factory, CHAINS } from '../src/index.js';
import type { ChainSupport } from '../src/index.js';

const { chainsSupportedByMarket, chainsSupportedByOevAuctions }: ChainSupport = chainSupportData;

const MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH = 10n;

// eslint-disable-next-line import/no-default-export
export default deployScript(
  async (env) => {
    const { deployer } = env.namedAccounts;

    // Hardhat 3 calls its built-in in-memory network `default`. A fork keeps the alias of the
    // chain it simulates, so this only lets the throwaway local chain through.
    const isLocalSimulation = env.name === 'default' && env.network.fork === undefined;
    if (!chainsSupportedByMarket.includes(env.name) && !isLocalSimulation) {
      throw new Error(`${env.name} is not supported`);
    }

    // skipIfAlreadyDeployed returns an existing record untouched, without comparing bytecode or
    // reaching the network. rocketh only logs when it deploys, so log the reuse here too.
    const deployOnce = async <TAbi extends Abi>(name: string, args: DeploymentConstruction<TAbi>) => {
      const result = await env.deploy(name, args, {
        skipIfAlreadyDeployed: true,
        deterministic: Boolean(process.env.DETERMINISTIC),
      });
      env.showMessage(
        result.newlyDeployed ? `Deployed "${name}" at ${result.address}` : `Reusing "${name}" at ${result.address}`
      );
      return result;
    };

    const isTestnet = CHAINS.find((chain) => chain.alias === env.name)?.testnet;
    const { owners, threshold } = isTestnet ? managerMultisigMetadata.testnet : managerMultisigMetadata.mainnet;
    const gnosisSafeWithoutProxy = await deployOnce('GnosisSafeWithoutProxy', {
      account: deployer,
      artifact: artifacts.GnosisSafeWithoutProxy,
      args: [owners as `0x${string}`[], BigInt(threshold)],
    });

    const ownableCallForwarder = await deployOnce('OwnableCallForwarder', {
      account: deployer,
      artifact: artifacts.OwnableCallForwarder,
      args: [gnosisSafeWithoutProxy.address],
    });

    const accessControlRegistry = await deployOnce('AccessControlRegistry', {
      account: deployer,
      artifact: artifacts.AccessControlRegistry,
      args: [],
    });

    const api3ServerV1 = await deployOnce('Api3ServerV1', {
      account: deployer,
      artifact: artifacts.Api3ServerV1,
      args: [accessControlRegistry.address, 'Api3ServerV1 admin', ownableCallForwarder.address],
    });

    const api3ServerV1OevExtension = await deployOnce('Api3ServerV1OevExtension', {
      account: deployer,
      artifact: artifacts.Api3ServerV1OevExtension,
      args: [
        accessControlRegistry.address,
        'Api3ServerV1OevExtension admin',
        ownableCallForwarder.address,
        api3ServerV1.address,
      ],
    });

    const api3ReaderProxyV1Factory = await deployOnce('Api3ReaderProxyV1Factory', {
      account: deployer,
      artifact: artifacts.Api3ReaderProxyV1Factory,
      args: [ownableCallForwarder.address, api3ServerV1OevExtension.address],
    });

    // The factory deploys this proxy itself, so it gets no deployment record.
    const signer = await new BrowserProvider(env.network.provider as never).getSigner(deployer);
    const factory = Api3ReaderProxyV1Factory__factory.connect(api3ReaderProxyV1Factory.address, signer);
    const dapiName = encodeBytes32String('ETH/USD');
    const dappId = 1;
    const api3ReaderProxyV1Metadata = '0x';
    const expectedApi3ReaderProxyV1Address = await factory.computeApi3ReaderProxyV1Address(
      dapiName,
      dappId,
      api3ReaderProxyV1Metadata
    );
    if ((await signer.provider.getCode(expectedApi3ReaderProxyV1Address)) === '0x') {
      const proxyTransactionResponse = await factory.deployApi3ReaderProxyV1(
        dapiName,
        dappId,
        api3ReaderProxyV1Metadata
      );
      await proxyTransactionResponse.wait(1);
      env.showMessage(`Deployed example Api3ReaderProxyV1 at ${expectedApi3ReaderProxyV1Address}`);
    }

    const api3MarketV2 = await deployOnce('Api3MarketV2', {
      account: deployer,
      artifact: artifacts.Api3MarketV2,
      args: [ownableCallForwarder.address, api3ReaderProxyV1Factory.address, MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH],
    });

    await deployOnce('AirseekerRegistry', {
      account: deployer,
      artifact: artifacts.AirseekerRegistry,
      args: [api3MarketV2.address, api3ServerV1.address],
    });

    if (chainsSupportedByOevAuctions.includes(env.name)) {
      await deployOnce('OevAuctionHouse', {
        account: deployer,
        artifact: artifacts.OevAuctionHouse,
        args: [accessControlRegistry.address, 'OevAuctionHouse admin', ownableCallForwarder.address],
      });
    }
  },
  { tags: ['deploy'] }
);
