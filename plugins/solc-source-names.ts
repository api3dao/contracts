import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { VerifyContractArgs } from '@nomicfoundation/hardhat-verify/verify';
import type { SolidityHooks } from 'hardhat/types/hooks';
import type { HardhatRuntimeEnvironment } from 'hardhat/types/hre';
import type { CompilerInput, SolidityBuildSystem } from 'hardhat/types/solidity';

// Hardhat 3 prefixes project source names with `project/`, and solc hashes the source names it is
// given into the metadata at the end of the creation bytecode. deployments/ was built with the
// `contracts/...` names, so dropping this moves every deterministic address. Only solc and the block
// explorers (see verifyContract) see the stripped names: the build info keeps Hardhat's, which EDR
// and hardhat-deploy look contracts up by.
const PREFIX = 'project/';

const strip = (name: string): string => (name.startsWith(PREFIX) ? name.slice(PREFIX.length) : name);

const mapKeys = <T>(record: Record<string, T>, f: (key: string) => string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [f(key), value]));

const mapValues = <T>(record: Record<string, T>, f: (value: T) => T): Record<string, T> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, f(value)]));

const stripSources = (input: CompilerInput): CompilerInput => ({ ...input, sources: mapKeys(input.sources, strip) });

// eslint-disable-next-line import/no-default-export
export default async (): Promise<Partial<SolidityHooks>> => ({
  async invokeSolc(context, compiler, solcInput, solcConfig, next) {
    // solc writes the remappings into the metadata of every contract in the job, so the one Hardhat
    // adds for an npm import would change the bytecode of all of them. The metadata on chain holds an
    // empty list.
    const remappings = solcInput.settings.remappings ?? [];
    if (remappings.length > 0) {
      throw new Error(
        `Solidity imports from npm packages are not supported, as their remappings (${remappings.join(', ')}) change the bytecode of every contract compiled with them. Vendor the file under contracts/vendor/ and import it by relative path.`
      );
    }

    // Only the names that were stripped get the prefix back, as coverage adds a source without it.
    const restore = (name: string): string => (Object.hasOwn(solcInput.sources, PREFIX + name) ? PREFIX + name : name);

    const output: any = await next(context, compiler, stripSources(solcInput), solcConfig);

    // The build system looks contracts up by their prefixed input source name to write artifacts.
    if (output.contracts !== undefined) output.contracts = mapKeys(output.contracts, restore);
    if (output.sources !== undefined) {
      output.sources = mapKeys(output.sources, restore);
      for (const source of Object.values<any>(output.sources)) {
        if (source?.ast?.absolutePath !== undefined) source.ast.absolutePath = restore(source.ast.absolutePath);
      }
    }
    // The build info saves the warnings too, so they keep Hardhat's names like the rest of it.
    for (const error of output.errors ?? []) {
      if (error?.sourceLocation?.file !== undefined) error.sourceLocation.file = restore(error.sourceLocation.file);
      for (const secondary of error?.secondarySourceLocations ?? []) {
        if (secondary?.file !== undefined) secondary.file = restore(secondary.file);
      }
    }

    return output;
  },
});

// Passes everything through to target, bound to it so private fields keep working, except overrides.
const override = <T extends object>(target: T, overrides: Partial<T>): T =>
  new Proxy(target, {
    get(object, key) {
      if (key in overrides) return overrides[key as keyof T];
      const value: unknown = Reflect.get(object, key);
      return typeof value === 'function' ? value.bind(object) : value;
    },
  });

// A build info id hashes the compiler input, so a copy made once stays valid.
const copies: Record<string, Promise<string>> = {};
const copyWith = async (
  from: string | undefined,
  dir: string,
  transform: (json: any) => unknown
): Promise<string | undefined> =>
  from === undefined
    ? undefined
    : (copies[from] ??= (async () => {
        const to = path.join(dir, path.basename(from));
        await mkdir(dir, { recursive: true });
        await writeFile(to, JSON.stringify(transform(JSON.parse(await readFile(from, 'utf8')))));
        return to;
      })());

// hardhat-verify submits the build info's source names and the contract's name among them, and
// explorers compile other bytecode than is on chain from the prefixed names. This hands it the
// compiler input and build info under the names solc compiled.
export const verifyContract = async (args: VerifyContractArgs, hre: HardhatRuntimeEnvironment): Promise<boolean> => {
  const { verifyContract: verify } = await import('@nomicfoundation/hardhat-verify/verify');
  const dir = path.join(hre.config.paths.cache, 'verification-build-info');

  const artifacts = override(hre.artifacts, {
    getBuildInfoPath: async (id) =>
      copyWith(await hre.artifacts.getBuildInfoPath(id), dir, (buildInfo) => ({
        ...buildInfo,
        userSourceNameMap: mapValues(buildInfo.userSourceNameMap, strip),
        input: stripSources(buildInfo.input),
      })),
    getBuildInfoOutputPath: async (id) =>
      copyWith(await hre.artifacts.getBuildInfoOutputPath(id), dir, (buildInfoOutput) => ({
        ...buildInfoOutput,
        output: { ...buildInfoOutput.output, contracts: mapKeys(buildInfoOutput.output.contracts, strip) },
      })),
  });

  const solidity = override(hre.solidity, {
    async getCompilationJobs(...params: Parameters<SolidityBuildSystem['getCompilationJobs']>) {
      const result = await hre.solidity.getCompilationJobs(...params);
      if (!result.success) return result;
      return {
        ...result,
        compilationJobsPerFile: new Map(
          [...result.compilationJobsPerFile].map(([file, job]) => [
            file,
            override(job, { getSolcInput: async () => stripSources(await job.getSolcInput()) }),
          ])
        ),
      };
    },
  });

  return verify(args, override(hre, { artifacts, solidity }));
};
