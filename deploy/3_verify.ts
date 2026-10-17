import { type Interface, AbiCoder, encodeBytes32String, getCreate2Address, keccak256, solidityPacked } from 'ethers';
import hre from 'hardhat';

import chainSupportData from '../data/chain-support.json' with { type: 'json' };
import { verifyContract } from '../plugins/solc-source-names.js';
import { deployScript } from '../rocketh/deploy.js';
import { CHAINS } from '../src/generated/chains.js';
import {
  type ChainSupport,
  Api3ReaderProxyV1__factory,
  ERC1967Proxy__factory,
  GnosisSafeWithoutProxy__factory,
  OwnableCallForwarder__factory,
} from '../src/index.js';

const { chainsSupportedByMarket, chainsSupportedByOevAuctions }: ChainSupport = chainSupportData;

const MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH = 10;

const recordedArgs = (factory: { createInterface: () => Interface }, deployment: { argsData: string }) => [
  ...AbiCoder.defaultAbiCoder().decode(factory.createInterface().deploy.inputs, deployment.argsData),
];

// eslint-disable-next-line import/no-default-export
export default deployScript(
  async (env) => {
    const isLocalSimulation = env.name === 'default' && env.network.fork === undefined;
    if (!chainsSupportedByMarket.includes(env.name) && !isLocalSimulation) {
      throw new Error(`${env.name} is not supported`);
    }

    // The contracts of a fork exist only in the simulation.
    if (env.network.fork !== undefined) {
      env.showMessage(`⚠️ Attention: Running on a fork of ${env.name}, skipping verification.`);
      return;
    }

    const verificationApiType = CHAINS.find((chain) => chain.alias === env.name)?.verificationApi?.type;

    if (verificationApiType === undefined) {
      env.showMessage(`⚠️ Attention: Verification API type is not defined for ${env.name}, skipping verification.`);
      return;
    }

    const verificationProvider = verificationApiType === 'other' ? 'blockscout' : verificationApiType;

    const GnosisSafeWithoutProxy = env.get('GnosisSafeWithoutProxy');
    await verifyContract(
      {
        address: GnosisSafeWithoutProxy.address,
        // Decoded from the record, not from data/manager-multisig-metadata.json: that file tracks the
        // current membership, so it stops describing a Safe already deployed once an owner changes.
        constructorArgs: recordedArgs(GnosisSafeWithoutProxy__factory, GnosisSafeWithoutProxy),
        provider: verificationProvider,
      },
      hre
    );

    const OwnableCallForwarder = env.get('OwnableCallForwarder');
    await verifyContract(
      {
        address: OwnableCallForwarder.address,
        // Decoded from the record as well, as many chains deployed it with an owner other than this Safe.
        constructorArgs: recordedArgs(OwnableCallForwarder__factory, OwnableCallForwarder),
        provider: verificationProvider,
      },
      hre
    );

    const AccessControlRegistry = env.get('AccessControlRegistry');
    await verifyContract({ address: AccessControlRegistry.address, provider: verificationProvider }, hre);

    const Api3ServerV1 = env.get('Api3ServerV1');
    await verifyContract(
      {
        address: Api3ServerV1.address,
        constructorArgs: [AccessControlRegistry.address, 'Api3ServerV1 admin', OwnableCallForwarder.address],
        provider: verificationProvider,
      },
      hre
    );

    const Api3ServerV1OevExtension = env.get('Api3ServerV1OevExtension');
    await verifyContract(
      {
        address: Api3ServerV1OevExtension.address,
        constructorArgs: [
          AccessControlRegistry.address,
          'Api3ServerV1OevExtension admin',
          OwnableCallForwarder.address,
          Api3ServerV1.address,
        ],
        provider: verificationProvider,
      },
      hre
    );

    const Api3ReaderProxyV1Factory = env.get('Api3ReaderProxyV1Factory');
    await verifyContract(
      {
        address: Api3ReaderProxyV1Factory.address,
        constructorArgs: [OwnableCallForwarder.address, Api3ServerV1OevExtension.address],
        provider: verificationProvider,
      },
      hre
    );

    const dapiName = encodeBytes32String('ETH/USD');
    const dappId = 1;
    const api3ReaderProxyV1Metadata = '0x';
    const api3ReaderProxyV1ImplementationInitcode = solidityPacked(
      ['bytes', 'bytes'],
      [
        Api3ReaderProxyV1__factory.bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['address', 'bytes32', 'uint256'],
          [Api3ServerV1OevExtension.address, dapiName, dappId]
        ),
      ]
    );
    const api3ReaderProxyV1ImplementationAddress = getCreate2Address(
      Api3ReaderProxyV1Factory.address,
      keccak256(api3ReaderProxyV1Metadata),
      keccak256(api3ReaderProxyV1ImplementationInitcode)
    );
    await verifyContract(
      {
        address: api3ReaderProxyV1ImplementationAddress,
        constructorArgs: [Api3ServerV1OevExtension.address, dapiName, dappId],
        provider: verificationProvider,
      },
      hre
    );

    const api3ReaderProxyV1Initcode = solidityPacked(
      ['bytes', 'bytes'],
      [
        ERC1967Proxy__factory.bytecode,
        AbiCoder.defaultAbiCoder().encode(
          ['address', 'bytes'],
          [api3ReaderProxyV1ImplementationAddress, api3ReaderProxyV1Metadata]
        ),
      ]
    );
    const api3ReaderProxyV1Address = getCreate2Address(
      Api3ReaderProxyV1Factory.address,
      keccak256(api3ReaderProxyV1Metadata),
      keccak256(api3ReaderProxyV1Initcode)
    );
    await verifyContract(
      {
        address: api3ReaderProxyV1Address,
        constructorArgs: [api3ReaderProxyV1ImplementationAddress, api3ReaderProxyV1Metadata],
        provider: verificationProvider,
      },
      hre
    );

    const Api3MarketV2 = env.get('Api3MarketV2');
    await verifyContract(
      {
        address: Api3MarketV2.address,
        constructorArgs: [
          OwnableCallForwarder.address,
          Api3ReaderProxyV1Factory.address,
          MAXIMUM_SUBSCRIPTION_QUEUE_LENGTH,
        ],
        provider: verificationProvider,
      },
      hre
    );

    const AirseekerRegistry = env.get('AirseekerRegistry');
    await verifyContract(
      {
        address: AirseekerRegistry.address,
        constructorArgs: [Api3MarketV2.address, Api3ServerV1.address],
        provider: verificationProvider,
      },
      hre
    );

    if (chainsSupportedByOevAuctions.includes(env.name)) {
      const OevAuctionHouse = env.get('OevAuctionHouse');
      await verifyContract(
        {
          address: OevAuctionHouse.address,
          constructorArgs: [AccessControlRegistry.address, 'OevAuctionHouse admin', OwnableCallForwarder.address],
          provider: verificationProvider,
        },
        hre
      );
    }
  },
  { tags: ['verify'] }
);
