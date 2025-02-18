import { z } from 'zod';

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

export const dappSchema = z.object({
  alias: z.string().regex(/^[\da-z-]+$/),
  name: z.string(),
  homepageUrl: z.string().url().optional(),
});

export type Dapp = z.infer<typeof dappSchema>;
