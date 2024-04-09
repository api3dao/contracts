import * as fs from 'node:fs';

import { hardhatConfig } from '@api3/chains';

fs.writeFileSync(
  'example.env',
  hardhatConfig.getEnvVariableNames().reduce((fileContents: string, envVariableName: string) => {
    if (!envVariableName.startsWith('HARDHAT_HTTP_RPC_URL_')) {
      return `${fileContents}${envVariableName}=\n`;
    }
    return fileContents;
  }, '')
);
