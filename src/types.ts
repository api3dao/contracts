import { z } from 'zod';

export const dappSchema = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string(),
  chainId: z.string().regex(/^\d+$/),
  url: z.string().url().optional(),
});

export type Dapp = z.infer<typeof dappSchema>;
