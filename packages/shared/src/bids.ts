import { z } from "zod";

import { addressSchema, bigintStringSchema, bytes32Schema } from "./common";
import { lotStatusSchema } from "./lots";

export const placeBidRequestSchema = z.object({
  bidAmount: bigintStringSchema,
  channelIdHint: bytes32Schema.optional(),
  clientBidId: z.string().min(1).max(128).optional()
});

export const acceptedBidResponseSchema = z.object({
  lotId: bytes32Schema,
  status: z.literal("accepted"),
  channelId: bytes32Schema,
  payer: addressSchema,
  bidAmount: bigintStringSchema,
  currentHighBidAmount: bigintStringSchema,
  minNextBid: bigintStringSchema,
  lotStatus: lotStatusSchema
});

export type PlaceBidRequest = z.infer<typeof placeBidRequestSchema>;
export type AcceptedBidResponse = z.infer<typeof acceptedBidResponseSchema>;

