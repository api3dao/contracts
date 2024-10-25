import * as fs from 'node:fs';
import { join } from 'node:path';

import { CHAINS } from '@api3/chains';
import { go } from '@api3/promise-utils';
import { config, ethers } from 'hardhat';

import {
  chainsSupportedByManagerMultisig,
  chainsSupportedByDapis,
  chainsSupportedByMarket,
} from '../data/chain-support.json';
import { dapiManagementMerkleRootSigners, dapiPricingMerkleRootSigners } from '../data/dapi-management-metadata.json';
import * as managerMultisigMetadata from '../data/manager-multisig-metadata.json';
import type {
  AccessControlRegistry,
  Api3MarketV2,
  Api3ReaderProxyV1Factory,
  GnosisSafeWithoutProxy,
  OwnableCallForwarder,
} from '../src/index';

async function validateDeployments(network: string) {
  if (chainsSupportedByManagerMultisig.includes(network)) {
    const provider = new ethers.JsonRpcProvider((config.networks[network] as any).url);

    // Validate the manager multisig owners and threshold
    const { address: gnosisSafeWithoutProxyAddress, abi: gnosisSafeWithoutProxyAbi } = JSON.parse(
      fs.readFileSync(join('deployments', network, `GnosisSafeWithoutProxy.json`), 'utf8')
    );
    const gnosisSafeWithoutProxy = new ethers.Contract(
      gnosisSafeWithoutProxyAddress,
      gnosisSafeWithoutProxyAbi,
      provider
    ) as unknown as GnosisSafeWithoutProxy;
    const goFetchGnosisSafeWithoutProxyOwners = await go(async () => gnosisSafeWithoutProxy.getOwners(), {
      retries: 5,
      attemptTimeoutMs: 10_000,
      totalTimeoutMs: 50_000,
      delay: {
        type: 'random',
        minDelayMs: 2000,
        maxDelayMs: 5000,
      },
    });
    if (!goFetchGnosisSafeWithoutProxyOwners.success || !goFetchGnosisSafeWithoutProxyOwners.data) {
      throw new Error(`${network} GnosisSafeWithoutProxy owners could not be fetched`);
    }
    const { owners: managerMultisigOwners, threshold: managerMultisigThreshold } =
      managerMultisigMetadata[
        CHAINS.find((chain) => chain.alias === process.env.NETWORK)?.testnet ? 'testnet' : 'mainnet'
      ];
    if (
      !(
        managerMultisigOwners.length === goFetchGnosisSafeWithoutProxyOwners.data.length &&
        managerMultisigOwners.every((managerMultisigOwner: string) =>
          goFetchGnosisSafeWithoutProxyOwners.data
            .map((owner) => ethers.getAddress(owner))
            .includes(ethers.getAddress(managerMultisigOwner))
        )
      )
    ) {
      throw new Error(
        `${network} GnosisSafeWithoutProxy owners are expected to be\n${managerMultisigOwners}\nbut are\n${goFetchGnosisSafeWithoutProxyOwners.data}`
      );
    }

    const goFetchGnosisSafeWithoutProxyThreshold = await go(async () => gnosisSafeWithoutProxy.getThreshold(), {
      retries: 5,
      attemptTimeoutMs: 10_000,
      totalTimeoutMs: 50_000,
      delay: {
        type: 'random',
        minDelayMs: 2000,
        maxDelayMs: 5000,
      },
    });
    if (!goFetchGnosisSafeWithoutProxyThreshold.success || !goFetchGnosisSafeWithoutProxyThreshold.data) {
      throw new Error(`${network} GnosisSafeWithoutProxy threshold could not be fetched`);
    }
    if (BigInt(managerMultisigThreshold) !== goFetchGnosisSafeWithoutProxyThreshold.data) {
      throw new Error(
        `${network} GnosisSafeWithoutProxy threshold is expected to be ${managerMultisigThreshold} but is ${goFetchGnosisSafeWithoutProxyThreshold.data}`
      );
    }

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
    if (ethers.getAddress(goFetchOwnableCallForwarderOwner.data) !== ethers.getAddress(gnosisSafeWithoutProxyAddress)) {
      throw new Error(
        `${network} OwnableCallForwarder owner ${ethers.getAddress(goFetchOwnableCallForwarderOwner.data)} is not the same as the manager multisig address ${ethers.getAddress(gnosisSafeWithoutProxyAddress)}`
      );
    }
    if (chainsSupportedByDapis.includes(network)) {
      // Validate that the Api3ReaderProxyV1Factory owner is OwnableCallForwarder
      const { address: api3ReaderProxyV1FactoryAddress, abi: api3ReaderProxyV1FactoryAbi } = JSON.parse(
        fs.readFileSync(join('deployments', network, `Api3ReaderProxyV1Factory.json`), 'utf8')
      );
      const api3ReaderProxyV1Factory = new ethers.Contract(
        api3ReaderProxyV1FactoryAddress,
        api3ReaderProxyV1FactoryAbi,
        provider
      ) as unknown as Api3ReaderProxyV1Factory;
      const goFetchApi3ReaderProxyV1FactoryOwner = await go(async () => api3ReaderProxyV1Factory.owner(), {
        retries: 5,
        attemptTimeoutMs: 10_000,
        totalTimeoutMs: 50_000,
        delay: {
          type: 'random',
          minDelayMs: 2000,
          maxDelayMs: 5000,
        },
      });
      if (!goFetchApi3ReaderProxyV1FactoryOwner.success || !goFetchApi3ReaderProxyV1FactoryOwner.data) {
        throw new Error(`${network} Api3ReaderProxyV1Factory owner could not be fetched`);
      }
      if (
        ethers.getAddress(goFetchApi3ReaderProxyV1FactoryOwner.data) !== ethers.getAddress(ownableCallForwarderAddress)
      ) {
        throw new Error(
          `${network} Api3ReaderProxyV1Factory owner ${ethers.getAddress(goFetchApi3ReaderProxyV1FactoryOwner.data)} is not the same as the OwnableCallForwarder address ${ethers.getAddress(ownableCallForwarderAddress)}`
        );
      }

      if (chainsSupportedByMarket.includes(network)) {
        // Validate that the Api3MarketV2 AirseekerRegistry address belongs to AirseekerRegistry
        const { address: api3MarketV2Address, abi: api3MarketV2Abi } = JSON.parse(
          fs.readFileSync(join('deployments', network, `Api3MarketV2.json`), 'utf8')
        );
        const api3MarketV2 = new ethers.Contract(
          api3MarketV2Address,
          api3MarketV2Abi,
          provider
        ) as unknown as Api3MarketV2;
        const goFetchApi3MarketV2AirseekerRegistry = await go(async () => api3MarketV2.airseekerRegistry(), {
          retries: 5,
          attemptTimeoutMs: 10_000,
          totalTimeoutMs: 50_000,
          delay: {
            type: 'random',
            minDelayMs: 2000,
            maxDelayMs: 5000,
          },
        });
        if (!goFetchApi3MarketV2AirseekerRegistry.success || !goFetchApi3MarketV2AirseekerRegistry.data) {
          throw new Error(`${network} Api3MarketV2 AirseekerRegistry address could not be fetched`);
        }
        const { address: airseekerRegistryAddress } = JSON.parse(
          fs.readFileSync(join('deployments', network, `AirseekerRegistry.json`), 'utf8')
        );
        if (
          ethers.getAddress(goFetchApi3MarketV2AirseekerRegistry.data) !== ethers.getAddress(airseekerRegistryAddress)
        ) {
          throw new Error(
            `${network} Api3MarketV2 AirseekerRegistry address ${ethers.getAddress(goFetchApi3MarketV2AirseekerRegistry.data)} is not the same as the AirseekerRegistry address ${airseekerRegistryAddress}`
          );
        }

        // Validate that Api3MarketV2 dAPI management and dAPI pricing MT hash signers are set
        const goFetchApi3MarketV2DapiManagementMerkleRootSignersHash = await go(
          async () =>
            api3MarketV2.hashTypeToSignersHash(
              ethers.solidityPackedKeccak256(['string'], ['dAPI management Merkle root'])
            ),
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
        if (
          !goFetchApi3MarketV2DapiManagementMerkleRootSignersHash.success ||
          !goFetchApi3MarketV2DapiManagementMerkleRootSignersHash.data
        ) {
          throw new Error(`${network} Api3MarketV2 dAPI management Merkle root signers hash could not be fetched`);
        }
        if (goFetchApi3MarketV2DapiManagementMerkleRootSignersHash.data === ethers.ZeroHash) {
          throw new Error(`${network} Api3MarketV2 dAPI management Merkle root signers are not set`);
        }
        if (
          goFetchApi3MarketV2DapiManagementMerkleRootSignersHash.data !==
          ethers.solidityPackedKeccak256(['address'], [dapiManagementMerkleRootSigners])
        ) {
          throw new Error(`${network} Api3MarketV2 dAPI management Merkle root signers are set incorrectly`);
        }
        const goFetchApi3MarketV2DapiPricingMerkleRootSignersHash = await go(
          async () =>
            api3MarketV2.hashTypeToSignersHash(
              ethers.solidityPackedKeccak256(['string'], ['dAPI pricing Merkle root'])
            ),
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
        if (
          !goFetchApi3MarketV2DapiPricingMerkleRootSignersHash.success ||
          !goFetchApi3MarketV2DapiPricingMerkleRootSignersHash.data
        ) {
          throw new Error(`${network} Api3MarketV2 dAPI pricing Merkle root signers hash could not be fetched`);
        }
        if (goFetchApi3MarketV2DapiPricingMerkleRootSignersHash.data === ethers.ZeroHash) {
          throw new Error(`${network} Api3MarketV2 dAPI pricing Merkle root signers are not set`);
        }
        if (
          goFetchApi3MarketV2DapiManagementMerkleRootSignersHash.data !==
          ethers.solidityPackedKeccak256(['address'], [dapiPricingMerkleRootSigners])
        ) {
          throw new Error(`${network} Api3MarketV2 dAPI pricing Merkle root signers are set incorrectly`);
        }

        // Validate that Api3MarketV2 is a dAPI name setter
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
        const goFetchApi3MarketV2DapiNameSetterRoleStatus = await go(
          async () => accessControlRegistry.hasRole(dapiNameSetterRole, api3MarketV2Address),
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
        if (!goFetchApi3MarketV2DapiNameSetterRoleStatus.success) {
          throw new Error(`${network} Api3MarketV2 dAPI name setter role status could not be fetched`);
        }
        if (!goFetchApi3MarketV2DapiNameSetterRoleStatus.data) {
          throw new Error(`${network} Api3MarketV2 does not have the dAPI name setter role`);
        }
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
