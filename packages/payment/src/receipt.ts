import { paymentReceiptSchema, type PaymentReceipt } from "@nasir/shared";

import { encodeBase64UrlJson } from "./base64url";

export type BuildPaymentReceiptParams = Omit<PaymentReceipt, "timestamp" | "status" | "method" | "intent"> & {
  timestamp?: string;
};

export function buildPaymentReceipt(params: BuildPaymentReceiptParams): PaymentReceipt {
  return paymentReceiptSchema.parse({
    status: "success",
    method: "tempo",
    intent: "session",
    timestamp: params.timestamp ?? new Date().toISOString(),
    ...params
  });
}

export function encodePaymentReceiptHeader(receipt: PaymentReceipt): string {
  return encodeBase64UrlJson(receipt);
}

