/* eslint-disable no-console */
import * as ethers from 'ethers';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  type Api3ServerV1,
  Api3ServerV1__factory,
  CHAINS,
  computeDappSpecificApi3ReaderProxyV1Address,
  unsafeComputeDappId,
  DAPPS,
  deploymentAddresses,
} from './index';

const COMMON_COMMAND_ARGUMENTS = {
  dappAlias: {
    type: 'string',
    demandOption: true,
    describe: 'dApp alias as specified in https://github.com/api3dao/contracts/tree/main/data/dapps',
  },
  chainId: {
    type: 'string',
    demandOption: true,
    describe: 'Chain ID',
  },
  dapiName: {
    type: 'string',
    demandOption: true,
    describe: 'dAPI (data feed) name as it appears on https://market.api3.org/',
  },
  strict: {
    type: 'boolean',
    default: true,
    describe: 'Requires validation steps to pass to print the proxy address',
  },
} as const;

const { dappAlias, chainId, dapiName, strict } = COMMON_COMMAND_ARGUMENTS;

// From https://github.com/api3dao/data-feeds/blob/main/packages/api3-market/src/utils/format.ts
const slugify = (text: string) => text.toLowerCase().replaceAll(/[^\da-z-]+/g, '-');

yargs(hideBin(process.argv))
  .command(
    'print-api3readerproxyv1-address',
    'Prints the dApp-specific Api3ReaderProxyV1 address',
    {
      'dapp-alias': dappAlias,
      'chain-id': chainId,
      'dapi-name': dapiName,
      strict,
    },
    async (args) => {
      const chain = CHAINS.find((chain) => chain.id === args['chain-id']);
      if (!chain) {
        console.error(`Chain with ID ${args['chain-id']} is not known`);
        process.exit(1);
      }
      console.log(`dApp alias: ${args['dapp-alias']}\nchain: ${chain.name}\ndAPI name: ${args['dapi-name']}`);
      const dappInfo = DAPPS.find((dapp) => Object.keys(dapp.aliases).includes(args['dapp-alias']));
      if (!dappInfo) {
        const message = `⚠️ Could not find any record for alias "${args['dapp-alias']}"`;
        if (args.strict) {
          console.error(message);
          process.exit(1);
        }
        console.warn(message);
      }
      if (dappInfo) {
        const [, aliasInfo] = Object.entries(dappInfo.aliases).find(([alias]) => alias === args['dapp-alias'])!;
        if (aliasInfo.description) console.log(`\nℹ️ ${aliasInfo.description}\n`);
      }
      const provider = new ethers.JsonRpcProvider(
        chain.providers.find((provider) => provider.alias === 'default')!.rpcUrl
      );
      const api3ServerV1 = new ethers.Contract(
        deploymentAddresses['Api3ServerV1'][chain.id as keyof (typeof deploymentAddresses)['Api3ServerV1']],
        Api3ServerV1__factory.abi,
        provider
      ) as unknown as Api3ServerV1;
      let timestamp;
      try {
        [, timestamp] = await api3ServerV1.readDataFeedWithDapiNameHash(
          ethers.keccak256(ethers.encodeBytes32String(args['dapi-name']))
        );
      } catch (error) {
        const message = '⚠️ Attempted to read the feed and failed';
        if (args.strict) {
          console.error(message);
          console.error((error as Error).message);
          process.exit(1);
        }
        console.warn(message);
      }
      if (timestamp && timestamp + BigInt(24 * 60 * 60) < Date.now() / 1000) {
        const message = `⚠️ Feed timestamp (${new Date(Number(timestamp) * 1000).toISOString()}) appears to be older than a day`;
        if (args.strict) {
          console.error(message);
          process.exit(1);
        }
        console.warn(message);
      }
      const proxyAddress = computeDappSpecificApi3ReaderProxyV1Address(
        args['dapp-alias'],
        args['chain-id'],
        args['dapi-name']
      );
      let code;
      try {
        code = await provider.getCode(proxyAddress);
      } catch (error) {
        const message = '⚠️ Attempted to check if the proxy has been deployed and failed';
        if (args.strict) {
          console.error(message);
          console.error((error as Error).message);
          process.exit(1);
        }
        console.warn(message);
      }
      if (code && code === '0x') {
        const message = '⚠️ Proxy does not appear to have been deployed';
        if (args.strict) {
          console.error(message);
          process.exit(1);
        }
        console.warn(message);
      }
      const marketUrl = `https://market.api3.org/${chain.alias}/${slugify(args['dapi-name'])}`;
      console.log(`• Please confirm that ${marketUrl} points to an active feed.`);
      console.log(
        `• Your proxy is at ${chain.explorer.blockExplorerUrl}address/${proxyAddress}\nPlease confirm that there is a contract deployed at this address before using it.`
      );
    }
  )
  .command(
    'compute-dapp-id',
    'Computes the dApp ID for a given dApp alias and chain ID',
    {
      'dapp-alias': dappAlias,
      'chain-id': chainId,
      strict,
    },
    (args) => {
      const chain = CHAINS.find((c) => c.id === args['chain-id']);
      if (!chain) {
        const message = `⚠️  Chain with ID ${args['chain-id']} is not known`;
        if (args.strict) {
          console.error(message);
          process.exit(1);
        }
        console.warn(message);
      }

      const dappInfo = DAPPS.find((dapp) => Object.keys(dapp.aliases).includes(args['dapp-alias']));
      if (!dappInfo) {
        const message = `⚠️  Could not find any record for alias "${args['dapp-alias']}"`;
        if (args.strict) {
          console.error(message);
          process.exit(1);
        }
        console.warn(message);
      } else if (chain) {
        const aliasInfo = dappInfo.aliases[args['dapp-alias']];
        if (!aliasInfo!.chains.includes(chain.alias)) {
          const message = `⚠️  dApp alias "${args['dapp-alias']}" is not available on chain "${chain.name}"`;
          if (args.strict) {
            console.error(message);
            process.exit(1);
          }
          console.warn(message);
        }
      }

      console.log(`\ndApp alias: ${args['dapp-alias']}\nchain: ${chain?.name ?? args['chain-id']}`);
      if (dappInfo) {
        const [, aliasInfo] = Object.entries(dappInfo.aliases).find(([alias]) => alias === args['dapp-alias'])!;
        if (aliasInfo.description) console.log(`\nℹ️  ${aliasInfo.description}`);
      }

      const dappId = unsafeComputeDappId(args['dapp-alias'], args['chain-id']);
      console.log(`\n• dApp ID: ${dappId.toString()}`);
    }
  )
  .help().argv;
