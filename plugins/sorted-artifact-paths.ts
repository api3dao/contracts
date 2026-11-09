import type { SolidityHooks } from 'hardhat/types/hooks';

// Hardhat lists the artifacts in no fixed order, and of the contracts that share a name, TypeChain
// re-exports only the first from typechain-types/index.ts, which the package publishes.
// contracts/vendor holds two `Ownable`s, so sort the list as Hardhat 2 did, for every build to export
// the same one. hardhat.config.ts registers this before TypeChain, which reads the same list.
// eslint-disable-next-line import/no-default-export
export default async (): Promise<Partial<SolidityHooks>> => ({
  async processArtifactsAfterSuccessfulBuild(_context, artifactPaths) {
    (artifactPaths as string[]).sort();
  },
});
