import {
  decodeBase64UrlJson,
  encodeBase64UrlJson,
  parsePaymentAuthenticateHeader
} from "@nasir/payment";
import {
  acceptedBidResponseSchema,
  listLotsResponseSchema,
  lotDetailSchema,
  lotStatusResponseSchema,
  paymentChallengeRequestSchema,
  placeBidRequestSchema,
  paymentCredentialSchema,
  paymentReceiptSchema,
  type AcceptedBidResponse,
  type PaymentChallenge,
  type PaymentChallengeRequest,
  type ProblemDetails
} from "@nasir/shared";

import { getWebEnv } from "./env";

const env = getWebEnv();

async function apiFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${env.NEXT_PUBLIC_API_ORIGIN}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  return response;
}

export async function getLots() {
  const response = await apiFetch("/v1/lots");
  const json = await response.json();
  return listLotsResponseSchema.parse(json);
}

export async function getLot(lotId: string) {
  const response = await apiFetch(`/v1/lots/${lotId}`);
  if (!response.ok) {
    throw await response.json();
  }

  return lotDetailSchema.parse(await response.json());
}

export async function getLotStatus(lotId: string) {
  const response = await apiFetch(`/v1/lots/${lotId}/status`);
  if (!response.ok) {
    throw await response.json();
  }

  return lotStatusResponseSchema.parse(await response.json());
}

export type UnpaidBidResponse =
  | { kind: "accepted"; bid: AcceptedBidResponse; receipt: unknown | null }
  | {
      kind: "challenge";
      challenge: PaymentChallenge;
      challengeRequest: PaymentChallengeRequest;
      problem: ProblemDetails | null;
    };

export async function requestBidChallenge(lotId: string, body: { bidAmount: string; channelIdHint?: string; clientBidId?: string }, idempotencyKey: string): Promise<UnpaidBidResponse> {
  const payload = placeBidRequestSchema.parse(body);
  const response = await apiFetch(`/v1/lots/${lotId}/bids`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (response.status === 402) {
    const header = parsePaymentAuthenticateHeader(response.headers.get("WWW-Authenticate") ?? undefined);
    if (!header) {
      throw new Error("API returned 402 without a parsable WWW-Authenticate header.");
    }

    return {
      kind: "challenge",
      challenge: header,
      challengeRequest: paymentChallengeRequestSchema.parse(decodeBase64UrlJson(header.request)),
      problem: json
    };
  }

  if (!response.ok) {
    throw json;
  }

  const receiptHeader = response.headers.get("Payment-Receipt");
  return {
    kind: "accepted",
    bid: acceptedBidResponseSchema.parse(json),
    receipt: receiptHeader ? paymentReceiptSchema.parse(decodeBase64UrlJson(receiptHeader)) : null
  };
}

export async function submitVoucherBidRetry(input: {
  lotId: string;
  idempotencyKey: string;
  body: { bidAmount: string; channelIdHint?: string; clientBidId?: string };
  challenge: PaymentChallenge;
  payer: string;
  channelId: string;
  signature: string;
}) {
  const body = placeBidRequestSchema.parse(input.body);
  const credential = paymentCredentialSchema.parse({
    challenge: input.challenge,
    payload: {
      action: "voucher",
      payer: input.payer,
      channelId: input.channelId,
      cumulativeAmount: body.bidAmount,
      signature: input.signature
    }
  });

  const response = await apiFetch(`/v1/lots/${input.lotId}/bids`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
      Authorization: `Payment ${encodeBase64UrlJson(credential)}`
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  const receiptHeader = response.headers.get("Payment-Receipt");

  return {
    status: response.status,
    ok: response.ok,
    body: json,
    receipt: receiptHeader ? paymentReceiptSchema.parse(decodeBase64UrlJson(receiptHeader)) : null,
    retryChallenge: response.status === 402 ? parsePaymentAuthenticateHeader(response.headers.get("WWW-Authenticate") ?? undefined) : null
  };
}
