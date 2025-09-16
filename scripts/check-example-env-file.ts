import * as fs from 'node:fs';

const apiKeyEnvName = 'ETHERSCAN_API_KEY';

const expectedEnvVars = ['MNEMONIC', apiKeyEnvName];
const expectedExampleEnvFileContents = expectedEnvVars.reduce((fileContents: string, envVariableName: string) => {
  return `${fileContents}${envVariableName}=\n`;
}, '');

const exampleEnvFileContents = fs.readFileSync('example.env', 'utf8');

if (exampleEnvFileContents !== expectedExampleEnvFileContents) {
  throw new Error(`example.env is outdated`);
}
