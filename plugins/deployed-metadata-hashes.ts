import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { glob } from 'glob';
import type { SolidityHooks } from 'hardhat/types/hooks';

// AccessControlRegistry, Api3ServerV1 and OwnableCallForwarder carry `@openzeppelin/...` source
// names in their on-chain metadata, which no build from this tree reproduces. Their CREATE2
// addresses depend on that metadata, so rewrite the compiled blob back to the deployed one.
//
// This runs on every build rather than as a build step, because `hardhat deploy` and
// `hardhat test` compile on their own and would otherwise use the unpatched bytecode.

const CBOR_BLOB = /a264697066735822[\da-f]{90}/g;

const REFERENCE_NETWORK = 'ethereum';

const lastBlob = (bytecode: string): string | undefined => bytecode.match(CBOR_BLOB)?.at(-1);

// eslint-disable-next-line import/no-default-export
export default async (): Promise<Partial<SolidityHooks>> => ({
  async processArtifactsAfterSuccessfulBuild(context) {
    // Coverage instruments the sources, so its bytecode is meant to differ from what is deployed.
    if (context.globalOptions.coverage === true) return;

    const deploymentsDir = join('deployments', REFERENCE_NETWORK);
    const deploymentPaths = await glob(`${deploymentsDir}/*.json`);
    const contractNames = deploymentPaths.map((path) => path.split('/').at(-1)!.replace('.json', '')).sort();

    const artifactsDir = context.config.paths.artifacts;
    const replacements: Record<string, string> = {};
    const artifactPaths: Record<string, string> = {};

    for (const contractName of contractNames) {
      const [artifactPath] = await glob(`${artifactsDir}/contracts/**/${contractName}.sol/${contractName}.json`);
      // A build of a single file does not produce every artifact.
      if (artifactPath === undefined) continue;
      artifactPaths[contractName] = artifactPath;

      const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
      const deployment = JSON.parse(await readFile(join(deploymentsDir, `${contractName}.json`), 'utf8'));
      const compiled = lastBlob(artifact.bytecode);
      const deployed = lastBlob(deployment.bytecode);
      if (compiled === undefined || deployed === undefined) {
        throw new Error(`${contractName} has no CBOR metadata blob to compare`);
      }
      if (compiled !== deployed) replacements[compiled] = deployed;
    }

    if (Object.keys(replacements).length === 0) return;
    const patch = (contents: string) =>
      Object.entries(replacements).reduce((acc, [compiled, deployed]) => acc.replaceAll(compiled, deployed), contents);

    // hardhat-deploy reads generated/artifacts, and deploy/3_verify.ts reads `.bytecode` off a
    // TypeChain factory to compute a CREATE2 address.
    const targets = [
      ...(await glob(`${artifactsDir}/contracts/**/*.json`)),
      ...(await glob('./generated/artifacts/**/*.ts')),
      ...(await glob('./typechain-types/factories/**/*__factory.ts')),
    ];
    for (const target of targets) {
      const contents = await readFile(target, 'utf8');
      const patched = patch(contents);
      if (patched !== contents) await writeFile(target, patched);
    }

    for (const [contractName, artifactPath] of Object.entries(artifactPaths)) {
      const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
      const deployment = JSON.parse(await readFile(join(deploymentsDir, `${contractName}.json`), 'utf8'));
      if (artifact.bytecode !== deployment.bytecode) {
        throw new Error(`${contractName} creation bytecode does not match ${REFERENCE_NETWORK} after patching`);
      }
      if (artifact.deployedBytecode !== deployment.deployedBytecode) {
        throw new Error(`${contractName} deployed bytecode does not match ${REFERENCE_NETWORK} after patching`);
      }
    }
  },
});
