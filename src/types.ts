import { z } from 'zod';

export const dappSchema = z.object({
  alias: z.string().regex(/^[\da-z-]+$/),
  name: z.string(),
  homepageUrl: z.string().url().optional(),
});

export type Dapp = z.infer<typeof dappSchema>;
