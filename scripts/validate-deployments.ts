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
      // Validate that the Beacons and the Beacon set used to estimate gas is initialized
      const { address: api3ServerV1Address, abi: api3ServerV1Abi } = JSON.parse(
        fs.readFileSync(join('deployments', network, `Api3ServerV1.json`), 'utf8')
      );
      const api3ServerV1 = new ethers.Contract(
        api3ServerV1Address,
        api3ServerV1Abi,
        provider
      ) as unknown as Api3ServerV1;
      const gasEstimationBeaconIds = [
        '0x04e74298b57a8feb27fa268064e8d82362f536506b436a11919a56d62a9614e4',
        '0xc36aef164807ec0212be5a5e88f96f6f08efa52aa619850f2aebbb57bbb05f5c',
        '0xc62860a80328b5a6f1ac0bb0efd47a561d49131ddd199d6c7aa7ba8b26c6808e',
        '0x9b9aa53f09673621edbcec5881ae4a096020da721cd46294e2cde433fa6a9002',
        '0xe3c8ef47ce467ab45e0aa204f1c82e77ca343866d188832bec0b454870df39db',
        '0x24350cc64cc0cda334222168c57d557e97c5831a896e4ccb7f1f2e3a19a3750a',
        '0x41b67b850cfdeddb613686eba44522aa6b9713cdb7027ff01ba10d2b522a7e73',
      ];
      const gasEstimationBeaconSetId = '0xfee26235840c5bb25159e649ff825d97f1446de6042291b57755bb94f6e19e97';
      const goFetchGasEstimationBeaconSet = await go(
        async () =>
          api3ServerV1.multicall.staticCall([
            ...gasEstimationBeaconIds.map((gasEstimationBeaconId) =>
              api3ServerV1.interface.encodeFunctionData('dataFeeds', [gasEstimationBeaconId])
            ),
            api3ServerV1.interface.encodeFunctionData('dataFeeds', [gasEstimationBeaconSetId]),
          ]),
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
      if (!goFetchGasEstimationBeaconSet.success || !goFetchGasEstimationBeaconSet.data) {
        throw new Error(`${network} gas estimation Beacon set could not be fetched`);
      }
      for (let beaconInd = 0; beaconInd < gasEstimationBeaconIds.length; beaconInd++) {
        const [value, timestamp] = ethers.AbiCoder.defaultAbiCoder().decode(
          ['int224', 'uint32'],
          goFetchGasEstimationBeaconSet.data[beaconInd]!
        );
        if (value !== BigInt(beaconInd + 1) || timestamp !== BigInt(beaconInd + 1)) {
          // We know that avalanche-testnet Beacons are initialized and accidentally updated again
          // eslint-disable-next-line unicorn/no-lonely-if
          if (network !== 'avalanche-testnet') {
            throw new Error(`${network} gas estimation Beacon #${beaconInd + 1} is not initialized as expected`);
          }
        }
      }
      const [beaconSetValue, beaconSetTimestamp] = ethers.AbiCoder.defaultAbiCoder().decode(
        ['int224', 'uint32'],
        goFetchGasEstimationBeaconSet.data[gasEstimationBeaconIds.length]!
      );
      if (beaconSetValue !== 4n || beaconSetTimestamp !== 4n) {
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
