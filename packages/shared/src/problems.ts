import { z } from "zod";

import { bigintStringSchema, bytes32Schema } from "./common";

export const problemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().min(1),
  lotId: bytes32Schema.optional(),
  minNextBid: bigintStringSchema.optional(),
  requiredBidAmount: bigintStringSchema.optional(),
  requiredTopUp: bigintStringSchema.optional(),
  channelId: bytes32Schema.optional()
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

