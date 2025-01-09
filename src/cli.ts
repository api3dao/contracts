import type * as http from 'node:http';
import * as https from 'node:https';

import { CHAINS } from '@api3/chains';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { computeDappSpecificApi3ReaderProxyV1Address } from './proxy';

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

async function requestToUrlReturns404(urlString: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = https.get(urlString, (response: http.IncomingMessage) => {
      response.resume();
      resolve(response.statusCode === 404);
    });
    request.on('error', (error: Error) => {
      reject(error);
    });
  });
}

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
      const marketUrl = `https://market.api3.org/${chain.alias}/${slugify(args['dapi-name'])}`;
      if (await requestToUrlReturns404(marketUrl)) {
        throw new Error(`${marketUrl} does not point to an active feed`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`• Please confirm that ${marketUrl} points to an active feed.`);
      }
      // eslint-disable-next-line no-console
      console.log(
        `• Your proxy address is ${chain.explorer.browserUrl}address/${computeDappSpecificApi3ReaderProxyV1Address(args['dapp-alias'], args['chain-id'], args['dapi-name'])}\nPlease confirm that there is a contract deployed at this address before using it.`
      );
    }
  )
  .help().argv;
