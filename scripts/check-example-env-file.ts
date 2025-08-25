import * as fs from 'node:fs';

import { hardhatConfig } from '../src/index';

const expectedEnvFileContents = hardhatConfig
  .getEnvVariableNames()
  .reduce((fileContents: string, envVariableName: string) => {
    if (!envVariableName.startsWith('HARDHAT_HTTP_RPC_URL_')) {
      return `${fileContents}${envVariableName}=\n`;
    }
    return fileContents;
  }, '');

const exampleEnvFileContents = fs.readFileSync('example.env', 'utf8');

if (exampleEnvFileContents !== expectedEnvFileContents) {
  throw new Error(`example.env is outdated`);
}
