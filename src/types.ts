import { z } from 'zod';

import { CHAINS } from './generated/chains';
import { hasUniqueEntries } from './utils/arrays';

export const chainExplorerAPIKeySchema = z.object({
  required: z.boolean(),
  hardhatEtherscanAlias: z.string().optional(),
});

export const chainExplorerAPISchema = z.object({
  key: chainExplorerAPIKeySchema,
  url: z.string().url(),
});

export const chainExplorerSchema = z.object({
  api: chainExplorerAPISchema.optional(),
  browserUrl: z.string().url(),
});

export const chainProviderSchema = z
  .object({
    alias: z.string(),
    homepageUrl: z.string().url().optional(),
    rpcUrl: z.string().url().optional(),
  })
  .refine(
    // Either rpcUrl or homepageUrl must be present
    (provider) => provider.rpcUrl ?? provider.homepageUrl,
    { message: 'rpcUrl or homepageUrl is required' }
  );

export const chainProvidersSchema = z.array(chainProviderSchema).superRefine((providers, ctx) => {
  if (!providers.some((p) => p.alias === 'default')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['providers', 'alias'],
      message: "a provider with alias 'default' is required",
    });
  }

  if (!hasUniqueEntries(providers, 'alias')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['providers', 'alias'],
      message: "cannot contain duplicate 'alias' values",
    });
  }

  providers.forEach((p) => {
    if ((p.alias === 'default' || p.alias === 'public') && !p.rpcUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['providers', 'rpcUrl'],
        message: "providers with alias 'default' or 'public' must also have an 'rpcUrl'",
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

export const chainAlias = z.string().refine(
  (value) => CHAINS.some((chain) => chain.alias === value),
  (value) => ({ message: `Invalid chain alias: ${value}` })
);

export type ChainAlias = z.infer<typeof chainAlias>;

export const dappSchema = z
  .strictObject({
    aliases: z.record(
      aliasSchema,
      z.strictObject({
        chains: z.array(chainAlias),
        title: z.string(),
        description: z.string().optional(),
      })
    ),
    multiAliased: z.boolean().optional(),
    homepageUrl: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.multiAliased === true) {
      Object.entries(value.aliases).forEach(([alias, aliasData]) => {
        if (aliasData.description === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Description is required for multiple aliased dApps`,
            path: ['aliases', alias],
          });
        }
      });
    }

    if (value.multiAliased === false && Object.keys(value.aliases).length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Multiple aliases are allowed only when 'multiAliased' is enabled`,
        path: ['aliases'],
      });
    }
  });

export type Dapp = z.infer<typeof dappSchema>;
