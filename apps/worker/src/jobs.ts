import { z } from "zod";

export const createLotJobSchema = z.object({
  lotId: z.string().min(1),
  metadataHash: z.string().min(1)
});

export const closeLotJobSchema = z.object({
  lotId: z.string().min(1),
  winnerChannelId: z.string().min(1),
  winningBidAmount: z.string().regex(/^(0|[1-9]\d*)$/)
});

export const cancelLotJobSchema = z.object({
  lotId: z.string().min(1)
});

export const executeWinnerJobSchema = z.object({
  lotId: z.string().min(1),
  lotPayee: z.string().min(1),
  cumulativeAmount: z.string().regex(/^(0|[1-9]\d*)$/),
  signature: z.string().min(1)
});

export const onchainJobPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create-lot"), payload: createLotJobSchema }),
  z.object({ type: z.literal("close-lot"), payload: closeLotJobSchema }),
  z.object({ type: z.literal("cancel-lot"), payload: cancelLotJobSchema }),
  z.object({ type: z.literal("execute-winner"), payload: executeWinnerJobSchema }),
  z.object({ type: z.literal("reconcile"), payload: z.object({ lotId: z.string().min(1) }) })
]);

