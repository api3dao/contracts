/* eslint-disable no-console */
import * as fs from 'node:fs';

import { hardhatConfig } from '../src/index';

async function main() {
  const expectedEnvVars = hardhatConfig
    .getEnvVariableNames()
    .reduce((fileContents: string, envVariableName: string) => {
      if (!envVariableName.startsWith('HARDHAT_HTTP_RPC_URL_')) {
        return `${fileContents}${envVariableName}=\n`;
      }
      return fileContents;
    }, '');

  const exampleEnvPath = './example.env';
  let exampleEnvContents = '';

  try {
    exampleEnvContents = fs.readFileSync(exampleEnvPath, `utf-8`);
  } catch (error) {
    console.error(`Could not read ${exampleEnvPath}:`, error);
    process.exit(1);
  }

  const missingEnvVars = expectedEnvVars.split('\n').filter((line) => line && !exampleEnvContents.includes(line));
  const extraEnvVars = exampleEnvContents.split('\n').filter((line) => line && !expectedEnvVars.includes(line));

  if (missingEnvVars.length > 0 || extraEnvVars.length > 0) {
    console.error('Missing env vars in example.env:', missingEnvVars);
    console.error('Extra env vars in example.env:', extraEnvVars);
    console.log('Please update example.env running "pnpm write-example-env-file"');
    process.exit(1);
  }
}

main();
