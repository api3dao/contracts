import * as fs from 'node:fs';
import { join } from 'node:path';

import { CHAINS } from '@api3/chains';
import { go } from '@api3/promise-utils';
import { config, ethers } from 'hardhat';

import {
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import managerMultisigAddresses from '../data/manager-multisig.json';
import type { AccessControlRegistry, Api3ServerV1, OwnableCallForwarder } from '../src/index';

async function validateDeployments(network: string) {
  if (Object.keys(managerMultisigAddresses).includes(network)) {
    const provider = new ethers.JsonRpcProvider((config.networks[network] as any).url);
    // Validate that the OwnableCallForwarder owner is the manager multisig
    const { address: ownableCallForwarderAddress, abi: ownableCallForwarderAbi } = JSON.parse(
      fs.readFileSync(join('deployments', network, `OwnableCallForwarder.json`), 'utf8')
    );
    const ownableCallForwarder = new ethers.Contract(
      ownableCallForwarderAddress,
      ownableCallForwarderAbi,
      provider
    ) as unknown as OwnableCallForwarder;
    const goFetchOwnableCallForwarderOwner = await go(async () => ownableCallForwarder.owner(), {
      retries: 5,
      attemptTimeoutMs: 10_000,
      totalTimeoutMs: 50_000,
      delay: {
        type: 'random',
        minDelayMs: 2000,
        maxDelayMs: 5000,
      },
    });
    if (!goFetchOwnableCallForwarderOwner.success || !goFetchOwnableCallForwarderOwner.data) {
      throw new Error(`${network} OwnableCallForwarder owner could not be fetched`);
    }
    if (
      goFetchOwnableCallForwarderOwner.data.toLowerCase() !==
      managerMultisigAddresses[network as keyof typeof managerMultisigAddresses].toLowerCase()
    ) {
      throw new Error(
        `${network} OwnableCallForwarder owner ${goFetchOwnableCallForwarderOwner.data.toLowerCase()} is not the same as the manager multisig address ${managerMultisigAddresses[network as keyof typeof managerMultisigAddresses].toLowerCase()}`
      );
    }
    if (chainsSupportedByDapis.includes(network)) {
      // Validate that the Beacon set used to estimate gas is initialized
      const { address: api3ServerV1Address, abi: api3ServerV1Abi } = JSON.parse(
        fs.readFileSync(join('deployments', network, `Api3ServerV1.json`), 'utf8')
      );
      const api3ServerV1 = new ethers.Contract(
        api3ServerV1Address,
        api3ServerV1Abi,
        provider
      ) as unknown as Api3ServerV1;
      const gasEstimationBeaconSetId = '0xfee26235840c5bb25159e649ff825d97f1446de6042291b57755bb94f6e19e97';
      const goFetchGasEstimationBeaconSet = await go(async () => api3ServerV1.dataFeeds(gasEstimationBeaconSetId), {
        retries: 5,
        attemptTimeoutMs: 10_000,
        totalTimeoutMs: 50_000,
        delay: {
          type: 'random',
          minDelayMs: 2000,
          maxDelayMs: 5000,
        },
      });
      if (!goFetchGasEstimationBeaconSet.success || !goFetchGasEstimationBeaconSet.data) {
        throw new Error(`${network} gas estimation Beacon set could not be fetched`);
      }
      if (goFetchGasEstimationBeaconSet.data[0] !== 4n || goFetchGasEstimationBeaconSet.data[1] !== 4n) {
        throw new Error(`${network} gas estimation Beacon set is not initialized as expected`);
      }
      if (chainsSupportedByMarket.includes(network)) {
        // Validate that ExternalMulticallSimulator and Api3Market are dAPI name setters
        const rootRole = ethers.solidityPackedKeccak256(['address'], [ownableCallForwarderAddress]);
        const adminRole = ethers.solidityPackedKeccak256(
          ['bytes32', 'bytes32'],
          [rootRole, ethers.solidityPackedKeccak256(['string'], ['Api3ServerV1 admin'])]
        );
        const dapiNameSetterRole = ethers.solidityPackedKeccak256(
          ['bytes32', 'bytes32'],
          [adminRole, ethers.solidityPackedKeccak256(['string'], ['dAPI name setter'])]
        );
        const { address: accessControlRegistryAddress, abi: accessControlRegistryAbi } = JSON.parse(
          fs.readFileSync(join('deployments', network, `AccessControlRegistry.json`), 'utf8')
        );
        const accessControlRegistry = new ethers.Contract(
          accessControlRegistryAddress,
          accessControlRegistryAbi,
          provider
        ) as unknown as AccessControlRegistry;
        const isTestnet = CHAINS.find((chain) => chain.alias === network)?.testnet;
        if (!isTestnet) {
          const { address: externalMulticallSimulatorAddress } = JSON.parse(
            fs.readFileSync(join('deployments', network, `ExternalMulticallSimulator.json`), 'utf8')
          );
          const goFetchExternalMulticallSimulatorDapiNameSetterRoleStatus = await go(
            async () => accessControlRegistry.hasRole(dapiNameSetterRole, externalMulticallSimulatorAddress),
            {
              retries: 5,
              attemptTimeoutMs: 10_000,
              totalTimeoutMs: 50_000,
              delay: {
                type: 'random',
                minDelayMs: 2000,
                maxDelayMs: 5000,
              },
            }
          );
          if (!goFetchExternalMulticallSimulatorDapiNameSetterRoleStatus.success) {
            throw new Error(`${network} ExternalMulticallSimulator dAPI name setter role status could not be fetched`);
          }
          if (!goFetchExternalMulticallSimulatorDapiNameSetterRoleStatus.data) {
            throw new Error(`${network} ExternalMulticallSimulator does not have the dAPI name setter role`);
          }
        }
        const { address: api3MarketAddress } = JSON.parse(
          fs.readFileSync(join('deployments', network, `Api3Market.json`), 'utf8')
        );
        const goFetchApi3MarketDapiNameSetterRoleStatus = await go(
          async () => accessControlRegistry.hasRole(dapiNameSetterRole, api3MarketAddress),
          {
            retries: 5,
            attemptTimeoutMs: 10_000,
            totalTimeoutMs: 50_000,
            delay: {
              type: 'random',
              minDelayMs: 2000,
              maxDelayMs: 5000,
            },
          }
        );
        if (!goFetchApi3MarketDapiNameSetterRoleStatus.success) {
          throw new Error(`${network} Api3Market dAPI name setter role status could not be fetched`);
        }
        if (!goFetchApi3MarketDapiNameSetterRoleStatus.data) {
          throw new Error(`${network} Api3Market does not have the dAPI name setter role`);
        }
      }
    }
  }
}

async function main() {
  const networks = process.env.NETWORK
    ? [process.env.NETWORK]
    : [...new Set([...chainsSupportedByDapis, ...chainsSupportedByOevAuctions])];

  const erroredMainnets: string[] = [];
  const erroredTestnets: string[] = [];
  await Promise.all(
    networks.map(async (network) => {
      try {
        await validateDeployments(network);
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
    console.error(`Validation failed on testnets: ${erroredTestnets.join(', ')}`);
  }
  if (erroredMainnets.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Validation failed on: ${erroredMainnets.join(', ')}`);
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
