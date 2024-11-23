import { z } from 'zod';

export const dappSchema = z.object({
  alias: z.string(),
});

export type Dapp = z.infer<typeof dappSchema>;
