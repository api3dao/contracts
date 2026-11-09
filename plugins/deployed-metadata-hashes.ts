import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { glob } from 'glob';
import type { SolidityHooks } from 'hardhat/types/hooks';

// AccessControlRegistry, Api3ServerV1 and OwnableCallForwarder carry `@openzeppelin/...` source
// names in their on-chain metadata, which no build from this tree reproduces. Their CREATE2
// addresses depend on that metadata, so rewrite these exact compiled blobs back to the deployed
// ones. Any other difference from the deployed bytecode fails the build.
//
// This runs on every build rather than as a build step, because `hardhat deploy` and
// `hardhat test` compile on their own and would otherwise use the unpatched bytecode.
const DEPLOYED_METADATA_BLOBS: Record<string, string> = {
  // AccessControlRegistry
  a264697066735822122049e79d59fec464055a13b1a550ea1be46e16effaf1876c0da61e0fcc8bfda86364736f6c63430008110033:
    'a2646970667358221220ae4f3421aaad5b1af12510ac03d7ec2649209de4471e48601a849e44cc2f1d5864736f6c63430008110033',
  // Api3ServerV1
  a2646970667358221220a4d1beae5a583496c3fd546c22d8d7b6026f64446d7a97937beedaa142a134b564736f6c63430008110033:
    'a2646970667358221220693313c61a998d79d0e9b250367bd14ac439bd3d1d1f36bf50317fc99059456d64736f6c63430008110033',
  // OwnableCallForwarder
  a2646970667358221220c6d60bcd12cea7d82a3c5388fa1fa84ca1d8dfa2917c4e9e0037441302a9a50e64736f6c63430008110033:
    'a26469706673582212209bc00d30ca9753335445fb76197730f010383979aa0fd4b393e2e8826680071064736f6c63430008110033',
};

const REFERENCE_NETWORK = 'ethereum';

const patch = (contents: string): string =>
  Object.entries(DEPLOYED_METADATA_BLOBS).reduce(
    (acc, [compiled, deployed]) => acc.replaceAll(compiled, deployed),
    contents
  );

// eslint-disable-next-line import/no-default-export
export default async (): Promise<Partial<SolidityHooks>> => ({
  async processArtifactsAfterSuccessfulBuild(context) {
    // Coverage instruments the sources, so its bytecode is meant to differ from what is deployed.
    if (context.globalOptions.coverage === true) return;

    const { root, artifacts: artifactsDir } = context.config.paths;
    const deploymentsDir = join(root, 'deployments', REFERENCE_NETWORK);

    // Checked before anything is written and on every build, as one served from the cache still
    // uses the artifacts a failed build left behind.
    for (const deploymentPath of await glob(`${deploymentsDir}/*.json`)) {
      const contractName = basename(deploymentPath, '.json');
      const [artifactPath] = await glob(`${artifactsDir}/contracts/**/${contractName}.sol/${contractName}.json`);
      // A build of a single file does not produce every artifact.
      if (artifactPath === undefined) continue;

      const artifact = JSON.parse(patch(await readFile(artifactPath, 'utf8')));
      const deployment = JSON.parse(await readFile(deploymentPath, 'utf8'));
      if (artifact.bytecode !== deployment.bytecode) {
        throw new Error(`${contractName} creation bytecode does not match ${REFERENCE_NETWORK} after patching`);
      }
      if (artifact.deployedBytecode !== deployment.deployedBytecode) {
        throw new Error(`${contractName} deployed bytecode does not match ${REFERENCE_NETWORK} after patching`);
      }
    }

    // hardhat-deploy reads generated/artifacts, and deploy/3_verify.ts reads `.bytecode` off a
    // TypeChain factory to compute a CREATE2 address.
    const { destinations } = context.config.generateTypedArtifacts;
    const targets = [
      ...(await glob(`${artifactsDir}/contracts/**/*.json`)),
      ...(await glob(destinations.map(({ folder }) => `${folder}/artifacts/**/*.ts`))),
      ...(await glob(`${root}/typechain-types/factories/**/*__factory.ts`)),
    ];
    for (const target of targets) {
      const contents = await readFile(target, 'utf8');
      const patched = patch(contents);
      if (patched !== contents) await writeFile(target, patched);
    }
  },
});
