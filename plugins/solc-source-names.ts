import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SolidityHooks } from 'hardhat/types/hooks';

// Hardhat 3 prefixes project source names with `project/`, and solc hashes the source names it is
// given into the metadata at the end of the creation bytecode. deployments/ was built with the
// `contracts/...` names, so dropping this moves every deterministic address.
const PREFIX = 'project/';

const strip = (key: string): string => (key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key);
const add = (key: string): string => (key.startsWith(PREFIX) ? key : PREFIX + key);

const mapKeys = <T>(record: Record<string, T>, f: (key: string) => string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [f(key), value]));

// eslint-disable-next-line import/no-default-export
export default async (): Promise<Partial<SolidityHooks>> => ({
  async preprocessSolcInputBeforeBuilding(context, solcInput, next) {
    const input = await next(context, solcInput);
    return {
      ...input,
      // The metadata on chain holds an empty remappings list.
      settings: { ...input.settings, remappings: [] },
      sources: mapKeys(input.sources, strip),
    };
  },

  async invokeSolc(context, compiler, solcInput, solcConfig, next) {
    // The build system looks contracts up by their prefixed input source name to write artifacts.
    const output: any = await next(context, compiler, solcInput, solcConfig);

    if (output.contracts !== undefined) output.contracts = mapKeys(output.contracts, add);
    if (output.sources !== undefined) {
      output.sources = mapKeys(output.sources, add);
      for (const source of Object.values<any>(output.sources)) {
        if (source?.ast?.absolutePath !== undefined) source.ast.absolutePath = add(source.ast.absolutePath);
      }
    }
    // remapCompilerError needs these to point an error at a file on disk.
    for (const error of output.errors ?? []) {
      if (error?.sourceLocation?.file !== undefined) error.sourceLocation.file = add(error.sourceLocation.file);
      for (const secondary of error?.secondarySourceLocations ?? []) {
        if (secondary?.file !== undefined) secondary.file = add(secondary.file);
      }
    }

    return output;
  },

  async processArtifactsAfterSuccessfulBuild(context) {
    // EDR reads the build info input and output together, so both halves need the prefixed names.
    const buildInfoDir = join(context.config.paths.artifacts, 'build-info');
    const fileNames = await readdir(buildInfoDir).catch(() => []);

    for (const fileName of fileNames) {
      if (!fileName.endsWith('.json') || fileName.endsWith('.output.json')) continue;

      const path = join(buildInfoDir, fileName);
      const buildInfo = JSON.parse(await readFile(path, 'utf8'));
      if (buildInfo.input?.sources === undefined) continue;

      buildInfo.input.sources = mapKeys(buildInfo.input.sources, add);
      await writeFile(path, JSON.stringify(buildInfo));
    }
  },
});
