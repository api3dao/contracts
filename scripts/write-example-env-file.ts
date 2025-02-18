import * as fs from 'node:fs';

import { hardhatConfig } from '../src/index';

fs.writeFileSync(
  'example.env',
  hardhatConfig.getEnvVariableNames().reduce((fileContents: string, envVariableName: string) => {
    if (!envVariableName.startsWith('HARDHAT_HTTP_RPC_URL_')) {
      return `${fileContents}${envVariableName}=\n`;
    }
    return fileContents;
  }, '')
);
