import { go } from '@api3/promise-utils';
import { z } from 'zod';

import { type Chain, CHAINS } from '../src/index';

const resultSchema = z.object({
  chainname: z.string(),
  chainid: z.string(),
  blockexplorer: z.string(),
  apiurl: z.string(),
  status: z.number(),
  comment: z.string(),
});

const etherscanV2SupportListSchema = z.object({
  comments: z.string(),
  totalcount: z.number(),
  result: z.array(resultSchema),
});

const ETHERSCAN_API_URL = 'https://api.etherscan.io/v2/chainlist';

async function main() {
  const warnings: string[] = [];
  const errors: string[] = [];

  const goResponse = await go(async () => fetch(ETHERSCAN_API_URL));

  if (!goResponse.success || !goResponse.data) {
    throw new Error('Etherscan API is not reachable');
  }

  const response = goResponse.data;

  if (!response.ok) {
    throw new Error(`Etherscan API responded with status: ${response.status}`);
  }

  const data = (await response.json()) as z.infer<typeof etherscanV2SupportListSchema>;

  const etherscanSupportedChains = data.result;

  for (const chain of CHAINS) {
    if (chain.verificationApi?.type === 'etherscan') {
      const isSupported = etherscanSupportedChains.some((supportedChain) => supportedChain.chainid === chain.id);

      if (!isSupported) {
        errors.push(
          `🔴 ${chain.alias} (ID: ${chain.id}) is set to use Etherscan v2 API but is not supported according to Etherscan API.`
        );
      }
    }
  }

  for (const supportedChain of etherscanSupportedChains) {
    const chain = CHAINS.find((c: Chain) => c.id === supportedChain.chainid);

    if (!chain) {
      continue;
    }

    if (chain.verificationApi?.type === 'etherscan' && chain.blockExplorerUrl !== supportedChain.blockexplorer) {
      errors.push(
        `🔴 ${supportedChain.chainname} (ID: ${supportedChain.chainid}) has a different block explorer URL. Local: ${chain.blockExplorerUrl}, Etherscan: ${supportedChain.blockexplorer}`
      );
    }

    if (!chain.verificationApi || chain.verificationApi.type !== 'etherscan') {
      warnings.push(
        `⚠️ ${supportedChain.chainname} (ID: ${supportedChain.chainid}) supports Etherscan v2 API but verificationApi is not set in the local chain list.`
      );
    }

    if (!chain) {
      warnings.push(`Chain ${supportedChain.chainname} (ID: ${supportedChain.chainid}) is missing from the CHAINS.`);
    }
  }

  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(warnings.join('\n'));
  }

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error(errors.join('\n'));
    throw new Error('Etherscan API check failed with errors.');
  }
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
