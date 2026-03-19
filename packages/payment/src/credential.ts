import {
  paymentChallengeSchema,
  paymentCredentialSchema,
  type PaymentChallenge,
  type PaymentCredential
} from "@nasir/shared";

import { decodeBase64UrlJson } from "./base64url";

const paymentPrefix = "Payment ";

export function parsePaymentAuthorizationHeader(headerValue: string | undefined): PaymentCredential | null {
  if (!headerValue) {
    return null;
  }

  if (!headerValue.startsWith(paymentPrefix)) {
    throw new Error("Authorization header does not use the Payment scheme.");
  }

  const encoded = headerValue.slice(paymentPrefix.length).trim();
  return paymentCredentialSchema.parse(decodeBase64UrlJson(encoded));
}

export function parsePaymentAuthenticateHeader(headerValue: string | undefined): PaymentChallenge | null {
  if (!headerValue) {
    return null;
  }

  if (!headerValue.startsWith(paymentPrefix)) {
    throw new Error("WWW-Authenticate header does not use the Payment scheme.");
  }

  const rawParams = headerValue.slice(paymentPrefix.length);
  const fields = Object.fromEntries([...rawParams.matchAll(/([a-z]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
  return paymentChallengeSchema.parse(fields);
}

export function ensureCredentialMatchesChallenge(credential: PaymentCredential, challenge: PaymentChallenge): void {
  const mismatchFields = (["id", "realm", "method", "intent", "request", "digest", "expires", "opaque"] as const).filter(
    (field) => credential.challenge[field] !== challenge[field]
  );

  if (mismatchFields.length > 0) {
    throw new Error(`Payment credential challenge echo mismatch: ${mismatchFields.join(", ")}`);
  }

  if (new Date(credential.challenge.expires).getTime() <= Date.now()) {
    throw new Error("Payment credential has expired.");
  }
}

