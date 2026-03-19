import { createHmac } from "node:crypto";

import {
  paymentChallengeOpaqueSchema,
  paymentChallengeRequestSchema,
  paymentChallengeSchema,
  type PaymentChallenge,
  type PaymentChallengeOpaque,
  type PaymentChallengeRequest
} from "@nasir/shared";

import { decodeBase64UrlJson, encodeBase64UrlText } from "./base64url";
import { createJsonBodyDigest } from "./digest";
import { canonicalizeJson } from "./jcs";

type BuildChallengeParams = {
  secret: string;
  realm: string;
  request: PaymentChallengeRequest;
  opaque: PaymentChallengeOpaque;
  body: unknown;
  ttlSeconds: number;
  now?: Date;
};

function buildChallengeId(secret: string, challenge: Omit<PaymentChallenge, "id">): string {
  const payload = canonicalizeJson(challenge);
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function buildPaymentChallenge(params: BuildChallengeParams): PaymentChallenge {
  const request = paymentChallengeRequestSchema.parse(params.request);
  const opaque = paymentChallengeOpaqueSchema.parse(params.opaque);
  const requestEncoded = encodeBase64UrlText(canonicalizeJson(request));
  const opaqueEncoded = encodeBase64UrlText(canonicalizeJson(opaque));
  const expires = new Date((params.now ?? new Date()).getTime() + params.ttlSeconds * 1_000).toISOString();

  const challengeWithoutId = paymentChallengeSchema.omit({ id: true }).parse({
    realm: params.realm,
    method: "tempo",
    intent: "session",
    request: requestEncoded,
    digest: createJsonBodyDigest(params.body),
    expires,
    opaque: opaqueEncoded
  });

  return paymentChallengeSchema.parse({
    ...challengeWithoutId,
    id: buildChallengeId(params.secret, challengeWithoutId)
  });
}

export function formatPaymentAuthenticateHeader(challenge: PaymentChallenge): string {
  const fields = [
    ["id", challenge.id],
    ["realm", challenge.realm],
    ["method", challenge.method],
    ["intent", challenge.intent],
    ["request", challenge.request],
    ["digest", challenge.digest],
    ["expires", challenge.expires],
    ["opaque", challenge.opaque]
  ];

  const params = fields.map(([key, value]) => `${key}="${value}"`).join(", ");
  return `Payment ${params}`;
}

export function decodeChallengeRequest(encoded: string): PaymentChallengeRequest {
  return paymentChallengeRequestSchema.parse(decodeBase64UrlJson(encoded));
}

export function decodeChallengeOpaque(encoded: string): PaymentChallengeOpaque {
  return paymentChallengeOpaqueSchema.parse(decodeBase64UrlJson(encoded));
}

type VerifyPaymentChallengeParams = {
  secret: string;
  challenge: PaymentChallenge;
  body: unknown;
  realm?: string;
  now?: Date;
};

export function verifyPaymentChallenge(params: VerifyPaymentChallengeParams) {
  const challenge = paymentChallengeSchema.parse(params.challenge);
  const expectedId = buildChallengeId(params.secret, {
    realm: challenge.realm,
    method: challenge.method,
    intent: challenge.intent,
    request: challenge.request,
    digest: challenge.digest,
    expires: challenge.expires,
    opaque: challenge.opaque
  });

  if (challenge.id !== expectedId) {
    throw new Error("Payment challenge id is invalid.");
  }

  if (params.realm && challenge.realm !== params.realm) {
    throw new Error("Payment challenge realm mismatch.");
  }

  const expectedDigest = createJsonBodyDigest(params.body);
  if (challenge.digest !== expectedDigest) {
    throw new Error("Payment challenge digest mismatch.");
  }

  if (new Date(challenge.expires).getTime() <= (params.now ?? new Date()).getTime()) {
    throw new Error("Payment challenge has expired.");
  }

  return {
    challenge,
    request: decodeChallengeRequest(challenge.request),
    opaque: decodeChallengeOpaque(challenge.opaque)
  };
}
