import { z } from 'zod';

import { CHAINS } from './generated/chains';
import { hasUniqueEntries } from './utils/arrays';

export const chainExplorerAPIKeySchema = z.object({
  required: z.boolean(),
  hardhatEtherscanAlias: z.string().optional(),
});

export const chainExplorerAPISchema = z.object({
  key: chainExplorerAPIKeySchema,
  url: z.url(),
});

export const chainExplorerSchema = z.object({
  api: chainExplorerAPISchema.optional(),
  browserUrl: z.url(),
});

export const chainProviderSchema = z
  .object({
    alias: z.string(),
    homepageUrl: z.url().optional(),
    rpcUrl: z.url().optional(),
  })
  .refine(
    // Either rpcUrl or homepageUrl must be present
    (provider) => provider.rpcUrl ?? provider.homepageUrl,
    {
      error: 'rpcUrl or homepageUrl is required',
    }
  );

export const chainProvidersSchema = z.array(chainProviderSchema).superRefine((providers, ctx) => {
  if (!providers.some((p) => p.alias === 'default')) {
    ctx.issues.push({
      code: 'custom',
      path: [],
      message: "a provider with alias 'default' is required",
      input: providers.map((p) => p.alias),
    });
  }

  if (!hasUniqueEntries(providers, 'alias')) {
    ctx.issues.push({
      code: 'custom',
      path: [],
      message: "cannot contain duplicate 'alias' values",
      input: providers.map((p) => p.alias),
    });
  }

  providers.forEach((p, index) => {
    if ((p.alias === 'default' || p.alias === 'public') && !p.rpcUrl) {
      ctx.issues.push({
        code: 'custom',
        path: [index, 'rpcUrl'],
        message: "providers with alias 'default' or 'public' must also have an 'rpcUrl'",
        input: p.rpcUrl,
      });
    }
  });
});

export const hardhatConfigOverrides = z.object({
  networks: z.record(z.string(), z.any()).optional(),
});

export const chainSchema = z.object({
  alias: z.string(),
  decimals: z.number().positive(),
  explorer: chainExplorerSchema,
  hardhatConfigOverrides: hardhatConfigOverrides.optional(),
  // Most chain IDs are numbers, but to remain flexible this has purposefully been kept as a string
  // It can be adjusted if we want to support chains that don't use numbers.
  // See: https://github.com/api3dao/chains/pull/1#discussion_r1161102392
  id: z.string().regex(/^\d+$/),
  name: z.string(),
  providers: chainProvidersSchema,
  skipProviderCheck: z.boolean().optional(), // For chains not supporting dAPIs
  symbol: z.string().min(1).max(6),
  testnet: z.boolean(),
});

export type Chain = z.infer<typeof chainSchema>;
export type ChainExplorer = z.infer<typeof chainExplorerSchema>;
export type ChainExplorerAPI = z.infer<typeof chainExplorerAPISchema>;
export type ChainExplorerAPIKey = z.infer<typeof chainExplorerAPIKeySchema>;
export type ChainHardhatConfigOverrides = z.infer<typeof hardhatConfigOverrides>;
export type ChainProviders = z.infer<typeof chainProvidersSchema>;
export type ChainProvider = z.infer<typeof chainProviderSchema>;

export interface HardhatNetworksConfig {
  [key: string]: {
    accounts: { mnemonic: string };
    chainId: number;
    url: string;
  };
}

// https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify#adding-support-for-other-networks
export interface HardhatEtherscanCustomChain {
  network: string;
  chainId: number;
  urls: { apiURL: string; browserURL: string };
}

export interface HardhatEtherscanConfig {
  apiKey: { [alias: string]: string };
  customChains: HardhatEtherscanCustomChain[];
}

export const aliasSchema = z.string().regex(/^[\da-z-]+$/);

export type Alias = z.infer<typeof aliasSchema>;

export const chainAlias = aliasSchema.refine((value) => CHAINS.some((chain) => chain.alias === value), {
  error: (issue) => `Invalid chain alias: ${issue.input}`,
});

export type ChainAlias = z.infer<typeof chainAlias>;

export const dappSchema = z.strictObject({
  aliases: z.record(
    aliasSchema,
    z.strictObject({
      chains: z.array(chainAlias),
      title: z.string(),
      description: z.string().optional(),
    })
  ),
  homepageUrl: z.url().optional(),
});

export type Dapp = z.infer<typeof dappSchema>;
