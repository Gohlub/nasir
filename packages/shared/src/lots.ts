import { z } from "zod";

import {
  addressSchema,
  bigintStringSchema,
  bytes32Schema,
  isoDatetimeSchema,
  nullableBigintStringSchema,
  nullableBytes32Schema
} from "./common";

export const lotStatusSchema = z.enum(["OPEN", "WINNER_LOCKED", "CANCELLED", "SETTLED"]);

export const lotSummarySchema = z.object({
  lotId: bytes32Schema,
  externalLotId: z.string().min(1),
  title: z.string().min(1),
  status: lotStatusSchema,
  currentHighBidAmount: nullableBigintStringSchema,
  minNextBid: bigintStringSchema,
  bidIncrement: bigintStringSchema,
  endsAt: isoDatetimeSchema.nullable()
});

export const lotDetailSchema = lotSummarySchema.extend({
  description: z.string().default(""),
  lotPayee: addressSchema,
  auctionHouse: addressSchema,
  escrowContract: addressSchema,
  quoteToken: addressSchema,
  chainId: z.number().int().positive(),
  currentHighChannelId: nullableBytes32Schema
});

export const lotStatusResponseSchema = z.object({
  lotId: bytes32Schema,
  status: lotStatusSchema,
  currentHighBidAmount: nullableBigintStringSchema,
  currentHighChannelId: nullableBytes32Schema,
  minNextBid: bigintStringSchema,
  endsAt: isoDatetimeSchema.nullable()
});

export const listLotsResponseSchema = z.object({
  lots: z.array(lotSummarySchema)
});

export type LotStatus = z.infer<typeof lotStatusSchema>;
export type LotSummary = z.infer<typeof lotSummarySchema>;
export type LotDetail = z.infer<typeof lotDetailSchema>;
export type LotStatusResponse = z.infer<typeof lotStatusResponseSchema>;
export type ListLotsResponse = z.infer<typeof listLotsResponseSchema>;

