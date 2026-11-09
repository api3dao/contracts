import { readFileSync } from 'node:fs';

import { glob } from 'glob';

export interface Artifact {
  abi: any[];
  bytecode: string;
  deployedBytecode: string;
  // Byte ranges of the immutable variables, which hold no value until the contract is deployed.
  immutableReferences?: Record<string, { length: number; start: number }[]>;
}

export async function readArtifact(contractName: string): Promise<Artifact> {
  const [path] = await glob(`./artifacts/contracts/**/${contractName}.sol/${contractName}.json`);
  if (path === undefined) {
    throw new Error(`${contractName} has no compiled artifact; run \`pnpm build:hardhat\` first`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}
