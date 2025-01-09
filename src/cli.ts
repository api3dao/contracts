import { CHAINS } from '@api3/chains';
import * as ethers from 'ethers';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  type Api3ServerV1,
  Api3ServerV1__factory,
  computeDappSpecificApi3ReaderProxyV1Address,
  deploymentAddresses,
} from './index';

const COMMON_COMMAND_ARGUMENTS = {
  dappAlias: {
    type: 'string',
    demandOption: true,
    describe: 'dApp alias as specified on https://docs.api3.org/dapps/oev-rewards/dapp-alias.html',
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
} as const;

const { dappAlias, chainId, dapiName } = COMMON_COMMAND_ARGUMENTS;

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
    },
    async (args) => {
      const chain = CHAINS.find((chain) => chain.id === args['chain-id']);
      if (!chain) {
        throw new Error(`Chain with ID ${args['chain-id']} is not known`);
      }
      // eslint-disable-next-line no-console
      console.log(`dApp alias: ${args['dapp-alias']}\nchain: ${chain.name}\ndAPI name: ${args['dapi-name']}`);
      const provider = new ethers.JsonRpcProvider(
        chain.providers.find((provider) => provider.alias === 'default')!.rpcUrl
      );
      const api3ServerV1 = new ethers.Contract(
        deploymentAddresses['Api3ServerV1'][chain.id as keyof (typeof deploymentAddresses)['Api3ServerV1']],
        Api3ServerV1__factory.abi,
        provider
      ) as unknown as Api3ServerV1;
      try {
        const [, timestamp] = await api3ServerV1.readDataFeedWithDapiNameHash(
          ethers.keccak256(ethers.encodeBytes32String(args['dapi-name']))
        );
        if (timestamp! + BigInt(24 * 60 * 60) < Date.now() / 1000) {
          // eslint-disable-next-line no-console
          console.log('⚠️ Feed timestamp appears to be stale');
        }
      } catch {
        // eslint-disable-next-line no-console
        console.log('⚠️ Attempted to read the feed and failed');
      }
      const proxyAddress = computeDappSpecificApi3ReaderProxyV1Address(
        args['dapp-alias'],
        args['chain-id'],
        args['dapi-name']
      );
      try {
        const code = await provider.getCode(proxyAddress);
        if (code === '0x') {
          // eslint-disable-next-line no-console
          console.log('⚠️ Proxy appears to not have been deployed');
        }
      } catch {
        // eslint-disable-next-line no-console
        console.log('⚠️ Attempted to check if the proxy has been deployed and failed');
      }
      const marketUrl = `https://market.api3.org/${chain.alias}/${slugify(args['dapi-name'])}`;
      // eslint-disable-next-line no-console
      console.log(`• Please confirm that ${marketUrl} points to an active feed.`);
      // eslint-disable-next-line no-console
      console.log(
        `• Your proxy address is ${chain.explorer.browserUrl}address/${proxyAddress}\nPlease confirm that there is a contract deployed at this address before using it.`
      );
    }
  )
  .help().argv;
