import { z } from "zod";

import {
  addressSchema,
  bigintStringSchema,
  bytes32Schema,
  hexSchema,
  isoDatetimeSchema
} from "./common";

export const paymentMethodSchema = z.literal("tempo");
export const paymentIntentSchema = z.literal("session");

export const paymentChallengeRequestSchema = z.object({
  amount: bigintStringSchema,
  unitType: z.literal("bid-reserve-base-unit"),
  suggestedDeposit: bigintStringSchema,
  currency: addressSchema,
  recipient: addressSchema,
  methodDetails: z.object({
    escrowContract: addressSchema,
    channelId: bytes32Schema.optional(),
    minVoucherDelta: bigintStringSchema,
    feePayer: z.boolean(),
    chainId: z.number().int().positive()
  })
});

export const paymentChallengeOpaqueSchema = z.object({
  kind: z.literal("auction-bid"),
  lotId: bytes32Schema,
  requestedBidAmount: bigintStringSchema,
  minNextBid: bigintStringSchema,
  auctionStateVersion: z.string().min(1)
});

export const paymentChallengeSchema = z.object({
  id: z.string().min(1),
  realm: z.string().min(1),
  method: paymentMethodSchema,
  intent: paymentIntentSchema,
  request: z.string().min(1),
  digest: z.string().min(1),
  expires: isoDatetimeSchema,
  opaque: z.string().min(1)
});

export const paymentChallengeEchoSchema = paymentChallengeSchema;

export const transactionEnvelopeSchema = z.object({
  to: addressSchema,
  data: hexSchema,
  value: bigintStringSchema.optional(),
  gas: bigintStringSchema.optional(),
  maxFeePerGas: bigintStringSchema.optional(),
  maxPriorityFeePerGas: bigintStringSchema.optional(),
  nonce: z.number().int().nonnegative().optional()
});

export const paymentVoucherPayloadSchema = z.object({
  action: z.literal("voucher"),
  channelId: bytes32Schema,
  payer: addressSchema,
  cumulativeAmount: bigintStringSchema,
  signature: hexSchema
});

export const paymentOpenPayloadSchema = z.object({
  action: z.literal("open"),
  payer: addressSchema,
  authorizedSigner: addressSchema,
  openTx: transactionEnvelopeSchema,
  voucher: paymentVoucherPayloadSchema
});

export const paymentTopUpPayloadSchema = z.object({
  action: z.literal("topUp"),
  channelId: bytes32Schema,
  payer: addressSchema,
  topUpAmount: bigintStringSchema,
  topUpTx: transactionEnvelopeSchema
});

export const paymentClosePayloadSchema = z.object({
  action: z.literal("close")
}).passthrough();

export const paymentCredentialPayloadSchema = z.discriminatedUnion("action", [
  paymentVoucherPayloadSchema,
  paymentOpenPayloadSchema,
  paymentTopUpPayloadSchema,
  paymentClosePayloadSchema
]);

export const paymentCredentialSchema = z.object({
  challenge: paymentChallengeEchoSchema,
  payload: paymentCredentialPayloadSchema
});

export const paymentReceiptSchema = z.object({
  status: z.literal("success"),
  method: paymentMethodSchema,
  intent: paymentIntentSchema,
  timestamp: isoDatetimeSchema,
  challengeId: z.string().min(1),
  channelId: bytes32Schema,
  acceptedCumulative: bigintStringSchema,
  spent: bigintStringSchema,
  reservedBidAmount: bigintStringSchema,
  standing: z.literal("highest"),
  lotId: bytes32Schema
});

export type PaymentChallengeRequest = z.infer<typeof paymentChallengeRequestSchema>;
export type PaymentChallengeOpaque = z.infer<typeof paymentChallengeOpaqueSchema>;
export type PaymentChallenge = z.infer<typeof paymentChallengeSchema>;
export type PaymentCredential = z.infer<typeof paymentCredentialSchema>;
export type PaymentCredentialPayload = z.infer<typeof paymentCredentialPayloadSchema>;
export type PaymentVoucherPayload = z.infer<typeof paymentVoucherPayloadSchema>;
export type PaymentOpenPayload = z.infer<typeof paymentOpenPayloadSchema>;
export type PaymentTopUpPayload = z.infer<typeof paymentTopUpPayloadSchema>;
export type PaymentClosePayload = z.infer<typeof paymentClosePayloadSchema>;
export type PaymentReceipt = z.infer<typeof paymentReceiptSchema>;
