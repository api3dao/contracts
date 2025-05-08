// Even though hardhat-etherscan claims to also verify the deployment locally,
// it doesn't expose that as a command. As a result, you can't verify deployments
// on chains at which there is no supported block explorer. This is an alternative
// that fetches the deployed bytecode from a chain and compares that with the output
// of the local compilation.

import * as fs from 'node:fs';
import { join } from 'node:path';

import { go } from '@api3/promise-utils';
import { config, deployments, ethers } from 'hardhat';
import type { Deployment } from 'hardhat-deploy/dist/types';

import {
  chainsSupportedByManagerMultisig,
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import { CHAINS } from '../src/index';

import { goAsyncOptions, skippedChainAliasesInOwnableCallForwarderConstructorArgumentVerification } from './constants';

const METADATA_HASH_LENGTH = 85 * 2;
// https://github.com/Arachnid/deterministic-deployment-proxy/tree/be3c5974db5028d502537209329ff2e730ed336c#proxy-address
const CREATE2_FACTORY_ADDRESS = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

function validateDeploymentArguments(network: string, deployment: Deployment, contractName: string) {
  let expectedDeploymentArgs: string[];
  switch (contractName) {
    case 'OwnableCallForwarder': {
      if (skippedChainAliasesInOwnableCallForwarderConstructorArgumentVerification.includes(network)) {
        expectedDeploymentArgs = deployment.args!;
        break;
      } else {
        const { address: gnosisSafeWithoutProxyAddress } = JSON.parse(
          fs.readFileSync(join('deployments', network, 'GnosisSafeWithoutProxy.json'), 'utf8')
        );
        expectedDeploymentArgs = [gnosisSafeWithoutProxyAddress];
        break;
      }
    }
    case 'Api3ServerV1': {
      const { address: accessControlRegistryAddress } = JSON.parse(
        fs.readFileSync(join('deployments', network, 'AccessControlRegistry.json'), 'utf8')
      );
      const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';
      const { address: ownableCallForwarderAddress } = JSON.parse(
        fs.readFileSync(join('deployments', network, 'OwnableCallForwarder.json'), 'utf8')
      );
      expectedDeploymentArgs = [
        accessControlRegistryAddress,
        api3ServerV1AdminRoleDescription,
        ownableCallForwarderAddress,
      ];
      break;
    }
    case 'Api3ServerV1OevExtension': {
      const { address: accessControlRegistryAddress } = JSON.parse(
        fs.readFileSync(join('deployments', network, 'AccessControlRegistry.json'), 'utf8')
      );
      const api3ServerV1OevExtensionAdminRoleDescription = 'Api3ServerV1OevExtension admin';
      const { address: ownableCallForwarderAddress } = JSON.parse(
        fs.readFileSync(join('deployments', network, 'OwnableCallForwarder.json'), 'utf8')
      );
      const { address: api3ServerV1Address } = JSON.parse(
        fs.readFileSync(join('deployments', network, 'Api3ServerV1.json'), 'utf8')
      );
      expectedDeploymentArgs = [
        accessControlRegistryAddress,
        api3ServerV1OevExtensionAdminRoleDescription,
        ownableCallForwarderAddress,
        api3ServerV1Address,
      ];
      break;
    }
    case 'Api3ReaderProxyV1Factory': {
      const { address: api3ServerV1OevExtensionAddress } = JSON.parse(
        fs.readFileSync(join('deployments', network, 'Api3ServerV1OevExtension.json'), 'utf8')
      );
      // We do not check the initial owner as it is mutable and is validated separately
      expectedDeploymentArgs = [deployment.args![0], api3ServerV1OevExtensionAddress];
      break;
    }
    case 'Api3MarketV2': {
      const { address: ownableCallForwarderAddress } = JSON.parse(
        fs.readFileSync(join('deployments', network, 'OwnableCallForwarder.json'), 'utf8')
      );
      const { address: api3ReaderProxyV1FactoryAddress } = JSON.parse(
        fs.readFileSync(join('deployments', network, 'Api3ReaderProxyV1Factory.json'), 'utf8')
      );
      const maximumSubscriptionQueueLength = 10;
      expectedDeploymentArgs = [
        ownableCallForwarderAddress,
        api3ReaderProxyV1FactoryAddress,
        maximumSubscriptionQueueLength,
      ];
      break;
    }
    case 'OevAuctionHouse': {
      const { address: accessControlRegistryAddress } = JSON.parse(
        fs.readFileSync(join('deployments', network, 'AccessControlRegistry.json'), 'utf8')
      );
      const oevAuctionHouseAdminRoleDescription = 'OevAuctionHouse admin';
      const { address: ownableCallForwarderAddress } = JSON.parse(
        fs.readFileSync(join('deployments', network, 'OwnableCallForwarder.json'), 'utf8')
      );
      expectedDeploymentArgs = [
        accessControlRegistryAddress,
        oevAuctionHouseAdminRoleDescription,
        ownableCallForwarderAddress,
      ];
      break;
    }
    default: {
      // The variables set by the deployment arguments of the other contracts are all
      // immutable, so they are validated separately and we have nothing to do here
      return;
    }
  }
  deployment.args!.map((deploymentArg: string, ind: number) => {
    if (deploymentArg !== expectedDeploymentArgs[ind]) {
      throw new Error(
        `${contractName} deployment arg #${ind} is expected to be ${expectedDeploymentArgs[ind]} but is ${deploymentArg}`
      );
    }
  });
}

async function verifyDeployments(network: string) {
  const provider = new ethers.JsonRpcProvider((config.networks[network] as any).url);
  const contractNames = [
    ...(chainsSupportedByDapis.includes(network)
      ? ['AccessControlRegistry', 'Api3ServerV1', 'Api3ServerV1OevExtension', 'Api3ReaderProxyV1Factory']
      : []),
    ...(chainsSupportedByMarket.includes(network) ? ['Api3MarketV2'] : []),
    ...(chainsSupportedByOevAuctions.includes(network) ? ['OevAuctionHouse'] : []),
    // GnosisSafeWithoutProxy is checked last because it fails on some chains due to provider issues
    // https://github.com/api3dao/contracts/issues/223
    ...(chainsSupportedByManagerMultisig.includes(network) ? ['OwnableCallForwarder', 'GnosisSafeWithoutProxy'] : []),
  ];

  for (const contractName of contractNames) {
    const deployment = JSON.parse(fs.readFileSync(join('deployments', network, `${contractName}.json`), 'utf8'));
    const artifact = await deployments.getArtifact(contractName);
    const constructor = artifact.abi.find((method) => method.type === 'constructor');

    validateDeploymentArguments(network, deployment, contractName);

    const expectedEncodedConstructorArguments = constructor
      ? ethers.AbiCoder.defaultAbiCoder().encode(
          constructor.inputs.map((input: any) => input.type),
          deployment.args
        )
      : '0x';
    const salt = ethers.ZeroHash;
    const expectedDeterministicDeploymentAddress = ethers.getCreate2Address(
      CREATE2_FACTORY_ADDRESS,
      salt,
      ethers.solidityPackedKeccak256(['bytes', 'bytes'], [artifact.bytecode, expectedEncodedConstructorArguments])
    );

    if (deployment.address === expectedDeterministicDeploymentAddress) {
      const goFetchContractCode = await go(async () => provider.getCode(deployment.address), goAsyncOptions);
      if (!goFetchContractCode.success || !goFetchContractCode.data) {
        throw new Error(`${network} ${contractName} (deterministic) contract code could not be fetched`);
      }
      if (goFetchContractCode.data === '0x') {
        throw new Error(`${network} ${contractName} (deterministic) contract code does not exist`);
      }
    } else {
      const goFetchCreationTx = await go(
        async () => provider.getTransaction(deployment.transactionHash),
        goAsyncOptions
      );
      if (!goFetchCreationTx.success || !goFetchCreationTx.data) {
        throw new Error(`${network} ${contractName} creation tx could not be fetched`);
      }
      const creationTx: any = goFetchCreationTx.data;
      const creationData = creationTx.data;

      if (deployment.address !== ethers.getCreateAddress(creationTx)) {
        throw new Error(`${network} ${contractName} creation tx deployment address does not match`);
      }

      const creationBytecode = creationData.slice(0, artifact.bytecode.length);
      const creationBytecodeWithoutMetadataHash = creationBytecode.slice(0, -METADATA_HASH_LENGTH);
      const creationMetadataHash = `0x${creationBytecode.slice(-METADATA_HASH_LENGTH)}`;
      const creationEncodedConstructorArguments = `0x${creationData.slice(creationBytecode.length)}`;

      const expectedCreationBytecode = artifact.bytecode;
      const expectedBytecodeWithoutMetadataHash = expectedCreationBytecode.slice(0, -METADATA_HASH_LENGTH);
      const expectedMetadataHash = `0x${expectedCreationBytecode.slice(-METADATA_HASH_LENGTH)}`;
      if (creationBytecodeWithoutMetadataHash !== expectedBytecodeWithoutMetadataHash) {
        throw new Error(`${network} ${contractName} deployment bytecode does not match`);
      }
      if (creationMetadataHash !== expectedMetadataHash) {
        // eslint-disable-next-line no-console
        console.log(`${network} ${contractName} deployment metadata hash does not match`);
      }
      if (creationEncodedConstructorArguments !== expectedEncodedConstructorArguments) {
        throw new Error(`${network} ${contractName} deployment constructor arguments do not match`);
      }
    }
  }
}

async function main() {
  const networks = process.env.NETWORK ? [process.env.NETWORK] : chainsSupportedByManagerMultisig;

  const erroredMainnets: string[] = [];
  const erroredTestnets: string[] = [];
  await Promise.all(
    networks.map(async (network) => {
      try {
        await verifyDeployments(network);
      } catch (error) {
        if (CHAINS.find((chain) => chain.alias === network)?.testnet) {
          erroredTestnets.push(network);
        } else {
          erroredMainnets.push(network);
        }
        // eslint-disable-next-line no-console
        console.error(error, '\n');
      }
    })
  );
  if (erroredTestnets.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Verification failed on testnets: ${erroredTestnets.join(', ')}`);
  }
  if (erroredMainnets.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Verification failed on: ${erroredMainnets.join(', ')}`);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
