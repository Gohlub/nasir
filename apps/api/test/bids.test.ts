import assert from "node:assert/strict";
import test from "node:test";

import { apiEnvSchema } from "@nasir/config";
import { Challenge, Credential } from "mppx";
import type { Session } from "mppx/tempo";
import { encodeAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { buildApiApp } from "../src/app";

const lotId = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const channelId = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const payerKey = "0x59c6995e998f97a5a0044966f0945382d7d58f7d9b5ecfd1f1c3f1e7a4e4b1c3" as const;
const payerAccount = privateKeyToAccount(payerKey);
const lotPayee = "0x0000000000000000000000000000000000000044";

async function signVoucher(env: ReturnType<typeof createEnv>, cumulativeAmount: string) {
  return payerAccount.signTypedData({
    domain: {
      name: "Tempo Stream Channel",
      version: "1",
      chainId: 42431,
      verifyingContract: env.ESCROW_ADDRESS as `0x${string}`
    },
    types: {
      Voucher: [
        { name: "channelId", type: "bytes32" },
        { name: "cumulativeAmount", type: "uint128" }
      ]
    },
    primaryType: "Voucher",
    message: {
      channelId: channelId as `0x${string}`,
      cumulativeAmount: BigInt(cumulativeAmount)
    }
  });
}

function createEnv() {
  return apiEnvSchema.parse({
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL: "postgres://unused",
    RPC_URL: "https://rpc.moderato.tempo.xyz",
    MPP_CHALLENGE_SECRET: "test-secret-0000000000000000",
    AUCTION_HOUSE_ADDRESS: "0x0000000000000000000000000000000000000011",
    ESCROW_ADDRESS: "0x0000000000000000000000000000000000000022",
    QUOTE_TOKEN_ADDRESS: "0x0000000000000000000000000000000000000033",
    CORS_ORIGINS: "http://localhost:3001",
    CHALLENGE_TTL_SECONDS: 90
  });
}

function createSessionState(env: ReturnType<typeof createEnv>): string {
  const state: Session.ChannelStore.State = {
    authorizedSigner: payerAccount.address,
    chainId: 42431,
    escrowContract: env.ESCROW_ADDRESS as `0x${string}`,
    channelId: channelId as `0x${string}`,
    createdAt: new Date("2026-03-19T12:00:00.000Z").toISOString(),
    deposit: 2_000n,
    finalized: false,
    highestVoucher: null,
    highestVoucherAmount: 0n,
    payee: lotPayee as `0x${string}`,
    payer: payerAccount.address,
    settledOnChain: 0n,
    spent: 0n,
    token: env.QUOTE_TOKEN_ADDRESS as `0x${string}`,
    units: 0
  };

  return JSON.stringify({
    ...state,
    deposit: state.deposit.toString(),
    highestVoucherAmount: state.highestVoucherAmount.toString(),
    settledOnChain: state.settledOnChain.toString(),
    spent: state.spent.toString()
  });
}

function createRepository(env: ReturnType<typeof createEnv>) {
  const lot = {
    id: "lot-row",
    lotId,
    externalLotId: "LOT-1",
    title: "Vintage Camera",
    description: "Test lot",
    lotPayee,
    status: "OPEN",
    currentHighBidAmount: null,
    currentHighChannelId: null,
    minNextBid: "1000",
    bidIncrement: "100",
    winnerChannelId: null,
    winningBidAmount: null,
    createTxHash: null,
    closeTxHash: null,
    executeTxHash: null,
    endsAt: null,
    createdAt: new Date("2026-03-19T12:00:00.000Z"),
    updatedAt: new Date("2026-03-19T12:00:00.000Z")
  };

  const channels = new Map<string, any>([
    [
      channelId,
      {
        channelId,
        lotId,
        payer: payerAccount.address.toLowerCase(),
        authorizedSigner: payerAccount.address.toLowerCase(),
        deposit: "2000",
        settled: "0",
        finalized: false,
        closeRequestedAt: null,
        latestVoucherAmount: null,
        latestVoucherSig: null,
        sessionState: createSessionState(env),
        createdAt: new Date("2026-03-19T12:00:00.000Z"),
        updatedAt: new Date("2026-03-19T12:00:00.000Z")
      }
    ]
  ]);

  return {
    async listLots() {
      return [lot];
    },
    async getLotById(requestedLotId: string) {
      return requestedLotId === lotId ? lot : null;
    },
    async getLotByPayee(requestedLotPayee: string) {
      return requestedLotPayee.toLowerCase() === lotPayee.toLowerCase() ? lot : null;
    },
    async getLotStatus(requestedLotId: string) {
      return requestedLotId === lotId
        ? {
            lotId: lot.lotId,
            status: lot.status,
            currentHighBidAmount: lot.currentHighBidAmount,
            currentHighChannelId: lot.currentHighChannelId,
            minNextBid: lot.minNextBid,
            endsAt: lot.endsAt
          }
        : null;
    },
    async getChannel(requestedChannelId: string) {
      return channels.get(requestedChannelId) ?? null;
    },
    async clearChannelSessionState(requestedChannelId: string) {
      const current = channels.get(requestedChannelId);
      if (!current) {
        return;
      }

      channels.set(requestedChannelId, {
        ...current,
        sessionState: null,
        updatedAt: new Date()
      });
    },
    async upsertChannelSnapshot(input: any) {
      const current = channels.get(input.channelId) ?? null;
      channels.set(input.channelId, {
        channelId: input.channelId,
        lotId: input.lotId,
        payer: input.payer,
        authorizedSigner: input.authorizedSigner,
        deposit: input.deposit,
        settled: input.settled,
        finalized: input.finalized,
        closeRequestedAt: input.closeRequestedAt,
        latestVoucherAmount: input.latestVoucherAmount ?? current?.latestVoucherAmount ?? null,
        latestVoucherSig: input.latestVoucherSig ?? current?.latestVoucherSig ?? null,
        sessionState: input.sessionState ?? current?.sessionState ?? null,
        createdAt: current?.createdAt ?? new Date(),
        updatedAt: new Date()
      });
    },
    async getAcceptedBid(requestedLotId: string, requestedChannelId: string, bidAmount: string) {
      const channel = channels.get(requestedChannelId);
      if (!channel || requestedLotId !== lotId || channel.latestVoucherAmount !== bidAmount) {
        return null;
      }

      return {
        lotId: requestedLotId,
        channelId: requestedChannelId,
        bidAmount,
        accepted: true
      };
    },
    async recordAcceptedBid(input: any) {
      lot.currentHighBidAmount = input.bidAmount;
      lot.currentHighChannelId = input.channelId;
      lot.minNextBid = input.nextMinBid;
      const current = channels.get(input.channelId) ?? {};
      channels.set(input.channelId, {
        ...current,
        channelId: input.channelId,
        lotId: input.lotId,
        payer: input.payer,
        authorizedSigner: input.authorizedSigner,
        deposit: input.deposit,
        settled: input.settled,
        finalized: input.finalized,
        closeRequestedAt: input.closeRequestedAt,
        latestVoucherAmount: input.bidAmount,
        latestVoucherSig: input.signature,
        sessionState: current.sessionState ?? null,
        createdAt: current.createdAt ?? new Date(),
        updatedAt: new Date()
      });
      return lot;
    }
  };
}

function createPublicClient(env: ReturnType<typeof createEnv>) {
  const encodedChannel = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "finalized", type: "bool" },
          { name: "closeRequestedAt", type: "uint64" },
          { name: "payer", type: "address" },
          { name: "payee", type: "address" },
          { name: "token", type: "address" },
          { name: "authorizedSigner", type: "address" },
          { name: "deposit", type: "uint128" },
          { name: "settled", type: "uint128" }
        ]
      }
    ],
    [
      {
        finalized: false,
        closeRequestedAt: 0n,
        payer: payerAccount.address,
        payee: lotPayee,
        token: env.QUOTE_TOKEN_ADDRESS,
        authorizedSigner: payerAccount.address,
        deposit: 2_000n,
        settled: 0n
      }
    ]
  );

  return {
    chain: {
      id: 42431
    },
    async request({ method }: { method: string }) {
      if (method === "eth_call") {
        return encodedChannel;
      }

      throw new Error(`Unsupported RPC method in test: ${method}`);
    }
  };
}

test("POST /bids returns 402 then accepts an SDK voucher retry", async () => {
  const env = createEnv();
  const repository = createRepository(env);
  const app = buildApiApp({
    env,
    repository: repository as never,
    publicClient: createPublicClient(env) as never
  });

  const firstResponse = await app.inject({
    method: "POST",
    url: `/v1/lots/${lotId}/bids`,
    headers: {
      "content-type": "application/json",
      host: "api.example.com"
    },
    payload: {
      bidAmount: "1000"
    }
  });

  assert.equal(firstResponse.statusCode, 402);
  const challenge = Challenge.deserialize(firstResponse.headers["www-authenticate"]!);

  const signature = await signVoucher(env, "1000");

  const secondResponse = await app.inject({
    method: "POST",
    url: `/v1/lots/${lotId}/bids`,
    headers: {
      "content-type": "application/json",
      authorization: Credential.serialize({
        challenge,
        payload: {
          action: "voucher",
          channelId,
          cumulativeAmount: "1000",
          signature
        }
      }),
      host: "api.example.com"
    },
    payload: {
      bidAmount: "1000"
    }
  });

  if (secondResponse.statusCode !== 200) {
    console.error("voucher retry failure", secondResponse.statusCode, secondResponse.body);
  }
  assert.equal(secondResponse.statusCode, 200);
  assert.ok(secondResponse.headers["payment-receipt"]);
  assert.deepEqual(secondResponse.json(), {
    lotId,
    status: "accepted",
    channelId,
    payer: payerAccount.address.toLowerCase(),
    bidAmount: "1000",
    currentHighBidAmount: "1000",
    minNextBid: "1100",
    lotStatus: "OPEN"
  });

  await app.close();
});

test("POST /bids extracts Payment from a mixed Authorization header", async () => {
  const env = createEnv();
  const repository = createRepository(env);
  const app = buildApiApp({
    env,
    repository: repository as never,
    publicClient: createPublicClient(env) as never
  });

  const firstResponse = await app.inject({
    method: "POST",
    url: `/v1/lots/${lotId}/bids`,
    headers: {
      "content-type": "application/json",
      host: "api.example.com"
    },
    payload: {
      bidAmount: "1000"
    }
  });

  assert.equal(firstResponse.statusCode, 402);
  const challenge = Challenge.deserialize(firstResponse.headers["www-authenticate"]!);
  const signature = await signVoucher(env, "1000");
  const paymentCredential = Credential.serialize({
    challenge,
    payload: {
      action: "voucher",
      channelId,
      cumulativeAmount: "1000",
      signature
    }
  });

  const secondResponse = await app.inject({
    method: "POST",
    url: `/v1/lots/${lotId}/bids`,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer some-jwt-token, ${paymentCredential}`,
      host: "api.example.com"
    },
    payload: {
      bidAmount: "1000"
    }
  });

  assert.equal(secondResponse.statusCode, 200);
  assert.ok(secondResponse.headers["payment-receipt"]);

  await app.close();
});

test("challenge/body mismatch returns 402 with an invalid-payment-credential detail", async () => {
  const env = createEnv();
  const repository = createRepository(env);
  const app = buildApiApp({
    env,
    repository: repository as never,
    publicClient: createPublicClient(env) as never
  });

  const firstResponse = await app.inject({
    method: "POST",
    url: `/v1/lots/${lotId}/bids`,
    headers: {
      "content-type": "application/json",
      host: "api.example.com"
    },
    payload: {
      bidAmount: "1000"
    }
  });

  const challenge = Challenge.deserialize(firstResponse.headers["www-authenticate"]!);

  const signature = await signVoucher(env, "1100");

  const secondResponse = await app.inject({
    method: "POST",
    url: `/v1/lots/${lotId}/bids`,
    headers: {
      "content-type": "application/json",
      authorization: Credential.serialize({
        challenge,
        payload: {
          action: "voucher",
          channelId,
          cumulativeAmount: "1100",
          signature
        }
      }),
      host: "api.example.com"
    },
    payload: {
      bidAmount: "1100"
    }
  });

  assert.equal(secondResponse.statusCode, 402);
  assert.ok(secondResponse.headers["www-authenticate"]);
  assert.match(String(secondResponse.json().detail), /digest mismatch/i);

  await app.close();
});

test("close is rejected on the bid route", async () => {
  const env = createEnv();
  const repository = createRepository(env);
  const app = buildApiApp({
    env,
    repository: repository as never,
    publicClient: createPublicClient(env) as never
  });

  const firstResponse = await app.inject({
    method: "POST",
    url: `/v1/lots/${lotId}/bids`,
    headers: {
      "content-type": "application/json",
      host: "api.example.com"
    },
    payload: {
      bidAmount: "1000"
    }
  });

  const challenge = Challenge.deserialize(firstResponse.headers["www-authenticate"]!);

  const signature = await signVoucher(env, "1000");

  const secondResponse = await app.inject({
    method: "POST",
    url: `/v1/lots/${lotId}/bids`,
    headers: {
      "content-type": "application/json",
      authorization: Credential.serialize({
        challenge,
        payload: {
          action: "close",
          channelId,
          cumulativeAmount: "1000",
          signature
        }
      }),
      host: "api.example.com"
    },
    payload: {
      bidAmount: "1000"
    }
  });

  assert.equal(secondResponse.statusCode, 403);
  assert.match(String(secondResponse.json().detail), /Close should be performed separately from bidding/i);

  await app.close();
});

test("health, discovery, and free lot reads are exposed for agents", async () => {
  const env = createEnv();
  const repository = createRepository(env);
  const app = buildApiApp({
    env,
    repository: repository as never,
    publicClient: createPublicClient(env) as never
  });

  const health = await app.inject({
    method: "GET",
    url: "/healthz",
    headers: {
      host: "api.example.com"
    }
  });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { ok: true });

  const openapi = await app.inject({
    method: "GET",
    url: "/openapi.json",
    headers: {
      host: "api.example.com"
    }
  });
  assert.equal(openapi.statusCode, 200);
  assert.equal(openapi.json().paths["/v1/lots/{lotId}/bids"].post["x-payment-info"].method, "tempo");

  const llms = await app.inject({
    method: "GET",
    url: "/llms.txt",
    headers: {
      host: "api.example.com"
    }
  });
  assert.equal(llms.statusCode, 200);
  assert.match(llms.body, /Authorization: Payment/);

  const lots = await app.inject({
    method: "GET",
    url: "/v1/lots",
    headers: {
      host: "api.example.com"
    }
  });
  assert.equal(lots.statusCode, 200);
  assert.equal(lots.json().lots[0].lotId, lotId);

  const detail = await app.inject({
    method: "GET",
    url: `/v1/lots/${lotId}`,
    headers: {
      host: "api.example.com"
    }
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().lotPayee, lotPayee);

  const status = await app.inject({
    method: "GET",
    url: `/v1/lots/${lotId}/status`,
    headers: {
      host: "api.example.com"
    }
  });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().minNextBid, "1000");

  await app.close();
});
