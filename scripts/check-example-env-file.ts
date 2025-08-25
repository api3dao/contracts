import * as fs from 'node:fs';

import { CHAINS } from '../src/generated/chains';
import { toUpperSnakeCase } from '../src/utils/strings';

const apiKeyEnvNames = CHAINS.filter((chain) => chain.explorer?.api?.key?.required).map(
  (chain) => `ETHERSCAN_API_KEY_${toUpperSnakeCase(chain.alias)}`
);

const expectedEnvVars = ['MNEMONIC', ...apiKeyEnvNames];
const expectedExampleEnvFileContents = expectedEnvVars.reduce((fileContents: string, envVariableName: string) => {
  return `${fileContents}${envVariableName}=\n`;
}, '');

const exampleEnvFileContents = fs.readFileSync('example.env', 'utf8');

if (exampleEnvFileContents !== expectedExampleEnvFileContents) {
  throw new Error(`example.env is outdated`);
}
