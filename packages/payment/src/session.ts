import {
  paymentClosePayloadSchema,
  paymentCredentialPayloadSchema,
  paymentOpenPayloadSchema,
  paymentTopUpPayloadSchema,
  paymentVoucherPayloadSchema,
  type PaymentClosePayload,
  type PaymentCredentialPayload,
  type PaymentOpenPayload,
  type PaymentTopUpPayload,
  type PaymentVoucherPayload
} from "@nasir/shared";

export type SupportedBidSessionPayload =
  | PaymentVoucherPayload
  | PaymentOpenPayload
  | PaymentTopUpPayload
  | PaymentClosePayload;

export function parseSessionPayload(payload: unknown): PaymentCredentialPayload {
  return paymentCredentialPayloadSchema.parse(payload);
}

export function assertSupportedBidAction(payload: PaymentCredentialPayload): SupportedBidSessionPayload {
  switch (payload.action) {
    case "voucher":
      return paymentVoucherPayloadSchema.parse(payload);
    case "open":
      return paymentOpenPayloadSchema.parse(payload);
    case "topUp":
      return paymentTopUpPayloadSchema.parse(payload);
    case "close":
      return paymentClosePayloadSchema.parse(payload);
  }
}
