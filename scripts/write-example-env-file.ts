import * as fs from 'node:fs';

import { hardhatConfig } from '@api3/chains';

fs.writeFileSync(
  'example.env',
  hardhatConfig.getEnvVariableNames().reduce((fileContents: string, envVariableName: string) => {
    return `${fileContents}${envVariableName}=\n`;
  }, '')
);
