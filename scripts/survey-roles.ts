// This script will not work with all providers but there are workarounds.
// See https://github.com/api3dao/contracts/pull/310
// TODO: Only display select role trees (which was not necessary at the time
// this script was implemented)
import * as fs from 'node:fs';
import { join } from 'node:path';

import { go } from '@api3/promise-utils';
import { config, ethers } from 'hardhat';

import { chainsSupportedByMarket } from '../data/chain-support.json';
import { CHAINS } from '../src/index';

import { goAsyncOptions } from './constants';

const MAXIMUM_GETLOGS_BLOCK_RANGE = 50_000;

async function surveyRoles(network: string) {
  if (!chainsSupportedByMarket.includes(network)) {
    return;
  }
  const provider = new ethers.JsonRpcProvider((config.networks[network] as any).url);
  const { address: accessControlRegistryAddress, abi: accessControlRegistryAbi } = JSON.parse(
    fs.readFileSync(join('deployments', network, `AccessControlRegistry.json`), 'utf8')
  );
  const accessControlRegistryInterface = new ethers.Interface(accessControlRegistryAbi);
  const blockNumber = await provider.getBlockNumber();
  let logs: any[] = [];
  let percentage = 0;
  for (let fromBlockNumber = 0; fromBlockNumber <= blockNumber; fromBlockNumber += MAXIMUM_GETLOGS_BLOCK_RANGE) {
    const goGetLogs = await go(
      async () =>
        provider.getLogs({
          address: accessControlRegistryAddress,
          fromBlock: fromBlockNumber,
          toBlock:
            fromBlockNumber + MAXIMUM_GETLOGS_BLOCK_RANGE > blockNumber
              ? blockNumber
              : fromBlockNumber + MAXIMUM_GETLOGS_BLOCK_RANGE,
        }),
      goAsyncOptions
    );
    if (!goGetLogs.success || !goGetLogs.data) {
      throw new Error(`${network} AccessControlRegistry logs could not be fetched`);
    }
    logs = [...logs, ...goGetLogs.data];
    if (percentage !== Math.floor((fromBlockNumber * 100) / blockNumber)) {
      percentage = Math.floor((fromBlockNumber * 100) / blockNumber);
      // eslint-disable-next-line no-console
      console.log(`${percentage}%`);
    }
  }
  const parsedLogs = logs.map((log) => accessControlRegistryInterface.parseLog(log));
  const roleToGrantees: Record<string, Set<string>> = {};
  for (const parsedLog of parsedLogs) {
    if (parsedLog!.name === 'RoleGranted') {
      if (roleToGrantees[parsedLog!.args[0]]) {
        roleToGrantees[parsedLog!.args[0]]!.add(parsedLog!.args[1]);
      } else {
        roleToGrantees[parsedLog!.args[0]] = new Set([parsedLog!.args[1]]);
      }
    } else if (parsedLog!.name === 'RoleRevoked') {
      roleToGrantees[parsedLog!.args[0]]!.delete(parsedLog!.args[1]);
    }
  }
  for (const [role, grantees] of Object.entries(roleToGrantees)) {
    if (parsedLogs.some((parsedLog) => parsedLog!.name === 'InitializedManager' && parsedLog!.args[0] === role)) {
      // Manager roles can't dangle so we don't worry about them
      continue;
    }
    const roleInitializationParsedLog = parsedLogs.find(
      (parsedLog) => parsedLog!.name === 'InitializedRole' && parsedLog!.args[0] === role
    );
    // eslint-disable-next-line no-console
    console.log(`${roleInitializationParsedLog!.args[2]}: ${[...grantees].join(' ')}`);
    // The important roles and expected grantees are:
    // - Api3ServerV1: "dAPI name setter" (OwnableCallForwarder and Api3MarketV2)
    // - Api3ServerV1OevExtension: "Withdrawer" (none), "Auctioneer" (OwnableCallForwarder and auctioneer EOA)
    // - OevAuctionHouse: "Proxy setter" (none), "Withdrawer" (none), "Auctioneer" (OwnableCallForwarder and auctioneer EOA)
    // In addition, all admin roles should only be granted to OwnableCallForwarder
  }
}

async function main() {
  const networks = process.env.NETWORK ? [process.env.NETWORK] : chainsSupportedByMarket;

  const erroredMainnets: string[] = [];
  const erroredTestnets: string[] = [];
  await Promise.all(
    networks.map(async (network) => {
      try {
        await surveyRoles(network);
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
    console.error(`Survey failed on testnets: ${erroredTestnets.join(', ')}`);
  }
  if (erroredMainnets.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Survey failed on: ${erroredMainnets.join(', ')}`);
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
