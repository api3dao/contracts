import * as fs from 'node:fs';
import * as path from 'node:path';

import { go } from '@api3/promise-utils';
import { config, ethers } from 'hardhat';

import api3MarketHashSigners from '../data/api3market-hash-signers.json';
import {
  chainsSupportedByDapis,
  chainsSupportedByMarket,
  chainsSupportedByOevAuctions,
} from '../data/chain-support.json';
import managerMultisigAddresses from '../data/manager-multisig.json';
import type { AccessControlRegistry, OwnableCallForwarder, Api3Market } from '../src/index';

async function main() {
  const networks = process.env.NETWORK
    ? [process.env.NETWORK]
    : new Set([...chainsSupportedByDapis, ...chainsSupportedByMarket, ...chainsSupportedByOevAuctions]);

  for (const network of networks) {
    if (chainsSupportedByDapis.includes(network)) {
      const provider = new ethers.JsonRpcProvider((config.networks[network] as any).url);
      // Validate that the OwnableCallForwarder owner is the manager multisig
      const { address: ownableCallForwarderAddress, abi: ownableCallForwarderAbi } = JSON.parse(
        fs.readFileSync(path.join('deployments', network, `OwnableCallForwarder.json`), 'utf8')
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
      if (chainsSupportedByMarket.includes(network)) {
        // Validate that Api3Market is a dAPI name setter
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
          fs.readFileSync(path.join('deployments', network, `AccessControlRegistry.json`), 'utf8')
        );
        const accessControlRegistry = new ethers.Contract(
          accessControlRegistryAddress,
          accessControlRegistryAbi,
          provider
        ) as unknown as AccessControlRegistry;
        const { address: api3MarketAddress, abi: api3MarketAbi } = JSON.parse(
          fs.readFileSync(path.join('deployments', network, `Api3Market.json`), 'utf8')
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
        if (!goFetchApi3MarketDapiNameSetterRoleStatus.success || !goFetchApi3MarketDapiNameSetterRoleStatus.data) {
          throw new Error(`${network} Api3Market dAPI name setter role status could not be fetched`);
        }
        if (!goFetchApi3MarketDapiNameSetterRoleStatus.data) {
          throw new Error(`${network} Api3Market does not have the dAPI name setter role`);
        }
        // Validate Api3Market hash signers
        const api3Market = new ethers.Contract(api3MarketAddress, api3MarketAbi, provider) as unknown as Api3Market;
        for (const [hashTypeName, signers] of Object.entries(api3MarketHashSigners)) {
          const goFetchHashTypeSignersHash = await go(
            async () => api3Market.hashTypeToSignersHash(ethers.solidityPackedKeccak256(['string'], [hashTypeName])),
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
          if (!goFetchHashTypeSignersHash.success || !goFetchHashTypeSignersHash.data) {
            throw new Error(`${network} ${hashTypeName} signers hash could not be fetched`);
          }
          if (goFetchHashTypeSignersHash.data !== ethers.solidityPackedKeccak256(['address[]'], [signers])) {
            throw new Error(`${network} ${hashTypeName} signers hash does not match ${signers.toString()}`);
          }
        }
      }
    }
  }
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
