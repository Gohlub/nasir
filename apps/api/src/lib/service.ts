import { readEscrowChannel } from "@nasir/chain";
import type { ApiEnv } from "@nasir/config";
import { AuctionRepository } from "@nasir/db";
import { createProblemDetails } from "@nasir/payment";
import {
  acceptedBidResponseSchema,
  listLotsResponseSchema,
  lotDetailSchema,
  lotStatusResponseSchema,
  placeBidRequestSchema,
  type LotDetail,
  type LotStatusResponse,
  type PlaceBidRequest
} from "@nasir/shared";
import { BodyDigest, Challenge, Credential, Receipt } from "mppx";
import { tempo } from "mppx/server";
import type { Session } from "mppx/tempo";
import type { PublicClient } from "viem";

import { DEFAULT_CHAIN_ID, ZERO_ADDRESS } from "./constants";
import { createRepositoryBackedPaymentStore } from "./mppx-session";

type ResponsePayload = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

type LotRow = Awaited<ReturnType<AuctionRepository["getLotById"]>> extends infer T ? NonNullable<T> : never;

export class ApiService {
  private readonly paymentStore: ReturnType<typeof createRepositoryBackedPaymentStore>;

  constructor(
    private readonly env: ApiEnv,
    private readonly repository: AuctionRepository,
    private readonly publicClient: PublicClient
  ) {
    this.paymentStore = createRepositoryBackedPaymentStore(this.repository, this.env);
  }

  async listLots() {
    const lots = await this.repository.listLots();
    return listLotsResponseSchema.parse({
      lots: lots.map((lot) => this.mapLotSummary(lot))
    });
  }

  async getLot(lotId: string): Promise<LotDetail | null> {
    const lot = await this.repository.getLotById(lotId.toLowerCase());
    return lot ? this.mapLotDetail(lot) : null;
  }

  async getLotStatus(lotId: string): Promise<LotStatusResponse | null> {
    const lot = await this.repository.getLotStatus(lotId.toLowerCase());
    if (!lot) {
      return null;
    }

    return lotStatusResponseSchema.parse({
      lotId: lot.lotId,
      status: lot.status,
      currentHighBidAmount: lot.currentHighBidAmount,
      currentHighChannelId: lot.currentHighChannelId,
      minNextBid: lot.minNextBid,
      endsAt: lot.endsAt?.toISOString() ?? null
    });
  }

  async handleBidRequest(input: {
    lotId: string;
    body: unknown;
    authorizationHeader?: string;
    realm: string;
    apiOrigin: string;
  }): Promise<ResponsePayload> {
    const normalizedLotId = input.lotId.toLowerCase();
    const body = placeBidRequestSchema.parse(input.body);
    const lotRow = await this.requireLot(normalizedLotId, input.apiOrigin);
    this.assertLotCanAcceptBid(lotRow.status, body.bidAmount, lotRow.minNextBid, normalizedLotId, input.apiOrigin);

    const challengeEnvelope = await this.buildBidChallenge({
      lot: lotRow,
      body,
      realm: input.realm
    });

    if (!input.authorizationHeader) {
      return this.requirePaymentResponse({
        challenge: challengeEnvelope.challenge,
        apiOrigin: input.apiOrigin,
        lotId: normalizedLotId,
        detail: "Retry the same request with Authorization: Payment after preparing the required Tempo session credential."
      });
    }

    let credential: Credential.Credential<Session.Types.SessionCredentialPayload>;
    try {
      credential = Credential.deserialize<Session.Types.SessionCredentialPayload>(input.authorizationHeader);
    } catch (error) {
      return this.requirePaymentResponse({
        challenge: challengeEnvelope.challenge,
        apiOrigin: input.apiOrigin,
        lotId: normalizedLotId,
        detail: error instanceof Error ? error.message : "The supplied Authorization: Payment credential was invalid."
      });
    }

    try {
      this.verifyBidCredential({
        credential,
        challenge: challengeEnvelope.challenge,
        body,
        realm: input.realm
      });

      const sessionMethod = this.createSessionMethod(lotRow);
      const payload = sessionMethod.schema.credential.payload.parse(credential.payload);

      if (payload.action === "close") {
        const problem = createProblemDetails({
          apiOrigin: input.apiOrigin,
          slug: "unsupported-bid-action",
          title: "Unsupported Bid Action",
          status: 403,
          detail: "Bid requests support Tempo session open, topUp, and voucher actions. Close should be performed separately from bidding.",
          lotId: normalizedLotId
        });

        return {
          status: 403,
          headers: {},
          body: problem
        };
      }

      const receipt = await sessionMethod.verify({
        credential: {
          challenge: credential.challenge,
          payload
        } as never,
        request: challengeEnvelope.challenge.request as never
      });

      const receiptHeader = Receipt.serialize(receipt);
      const channelId = receipt.reference.toLowerCase();

      if (payload.action === "topUp") {
        return {
          status: 204,
          headers: {
            "Payment-Receipt": receiptHeader,
            "Cache-Control": "no-store"
          },
          body: null
        };
      }

      const sessionState = await this.paymentStore.get<Session.ChannelStore.State>(channelId);
      if (!sessionState || !sessionState.highestVoucher) {
        const problem = createProblemDetails({
          apiOrigin: input.apiOrigin,
          slug: "channel-not-found",
          title: "Channel Not Found",
          status: 410,
          detail: "The referenced channel is unknown or no longer available for bidding.",
          lotId: normalizedLotId,
          channelId
        });

        return {
          status: 410,
          headers: {},
          body: problem
        };
      }

      if (sessionState.payee.toLowerCase() !== lotRow.lotPayee.toLowerCase()) {
        const problem = createProblemDetails({
          apiOrigin: input.apiOrigin,
          slug: "wrong-channel-payee",
          title: "Wrong Channel Payee",
          status: 403,
          detail: "The referenced channel does not belong to this lot payee.",
          lotId: normalizedLotId,
          channelId
        });

        return {
          status: 403,
          headers: {},
          body: problem
        };
      }

      if (sessionState.token.toLowerCase() !== this.env.QUOTE_TOKEN_ADDRESS.toLowerCase()) {
        const problem = createProblemDetails({
          apiOrigin: input.apiOrigin,
          slug: "wrong-channel-token",
          title: "Wrong Channel Token",
          status: 403,
          detail: "The referenced channel token does not match the auction quote token.",
          lotId: normalizedLotId,
          channelId
        });

        return {
          status: 403,
          headers: {},
          body: problem
        };
      }

      if (sessionState.finalized) {
        const problem = createProblemDetails({
          apiOrigin: input.apiOrigin,
          slug: "channel-gone",
          title: "Channel Unavailable",
          status: 410,
          detail: "The referenced channel cannot be used for this lot.",
          lotId: normalizedLotId,
          channelId
        });

        return {
          status: 410,
          headers: {},
          body: problem
        };
      }

      if (sessionState.deposit < BigInt(body.bidAmount)) {
        const requiredTopUp = (BigInt(body.bidAmount) - sessionState.deposit).toString();
        return this.requirePaymentResponse({
          challenge: challengeEnvelope.challenge,
          apiOrigin: input.apiOrigin,
          lotId: normalizedLotId,
          detail: "The current authorization does not cover the requested bid.",
          problemSlug: "session/insufficient-balance",
          problemTitle: "Insufficient Authorized Balance",
          extra: {
            requiredBidAmount: body.bidAmount,
            requiredTopUp,
            channelId
          }
        });
      }

      const existingAccepted = await this.repository.getAcceptedBid(normalizedLotId, channelId, body.bidAmount);
      const responseBody = this.buildAcceptedResponse({
        lotId: normalizedLotId,
        channelId,
        payer: sessionState.payer.toLowerCase(),
        bidAmount: body.bidAmount,
        bidIncrement: lotRow.bidIncrement
      });

      if (existingAccepted) {
        return {
          status: 200,
          headers: {
            "Payment-Receipt": receiptHeader,
            "Cache-Control": "private"
          },
          body: responseBody
        };
      }

      if (sessionState.highestVoucherAmount.toString() !== body.bidAmount) {
        const problem = createProblemDetails({
          apiOrigin: input.apiOrigin,
          slug: "invalid-voucher-amount",
          title: "Invalid Voucher Amount",
          status: 403,
          detail: "Accepted bid vouchers must match the requested bidAmount exactly.",
          lotId: normalizedLotId,
          channelId
        });

        return {
          status: 403,
          headers: {},
          body: problem
        };
      }

      await this.repository.recordAcceptedBid({
        lotId: normalizedLotId,
        channelId,
        payer: sessionState.payer.toLowerCase(),
        authorizedSigner:
          sessionState.authorizedSigner.toLowerCase() === sessionState.payer.toLowerCase()
            ? null
            : sessionState.authorizedSigner.toLowerCase(),
        deposit: sessionState.deposit.toString(),
        settled: sessionState.settledOnChain.toString(),
        finalized: sessionState.finalized,
        closeRequestedAt: null,
        bidAmount: body.bidAmount,
        nextMinBid: (BigInt(body.bidAmount) + BigInt(lotRow.bidIncrement)).toString(),
        signature: sessionState.highestVoucher.signature
      });

      return {
        status: 200,
        headers: {
          "Payment-Receipt": receiptHeader,
          "Cache-Control": "private"
        },
        body: responseBody
      };
    } catch (error) {
      return this.requirePaymentResponse({
        challenge: challengeEnvelope.challenge,
        apiOrigin: input.apiOrigin,
        lotId: normalizedLotId,
        detail: error instanceof Error ? error.message : "The supplied Authorization: Payment credential was invalid."
      });
    }
  }

  private requirePaymentResponse(parameters: {
    challenge: Challenge.Challenge<Record<string, unknown>>;
    apiOrigin: string;
    lotId: string;
    detail: string;
    problemSlug?: string;
    problemTitle?: string;
    extra?: Record<string, unknown>;
  }) {
    const problem = createProblemDetails({
      apiOrigin: parameters.apiOrigin,
      slug: parameters.problemSlug ?? "payment-required",
      title: parameters.problemTitle ?? "Payment Required",
      status: 402,
      detail: parameters.detail,
      lotId: parameters.lotId,
      ...(parameters.extra ?? {})
    });

    return {
      status: 402,
      headers: {
        "WWW-Authenticate": Challenge.serialize(parameters.challenge),
        "Cache-Control": "no-store"
      },
      body: problem
    };
  }

  private verifyBidCredential(parameters: {
    credential: Credential.Credential<Session.Types.SessionCredentialPayload>;
    challenge: Challenge.Challenge<Record<string, unknown>>;
    body: PlaceBidRequest;
    realm: string;
  }) {
    const { credential, challenge, body, realm } = parameters;

    if (!Challenge.verify(credential.challenge, { secretKey: this.env.MPP_CHALLENGE_SECRET })) {
      throw new Error("Payment challenge id is invalid.");
    }

    if (credential.challenge.realm !== realm) {
      throw new Error("Payment challenge realm mismatch.");
    }

    if (credential.challenge.digest && !BodyDigest.verify(credential.challenge.digest as BodyDigest.BodyDigest, body)) {
      throw new Error("Payment challenge digest mismatch.");
    }

    if (credential.challenge.method !== "tempo" || credential.challenge.intent !== "session") {
      throw new Error("Unsupported payment method or intent.");
    }

    const expectedMeta = Challenge.meta(challenge) ?? {};
    const receivedMeta = Challenge.meta(credential.challenge) ?? {};
    if (expectedMeta.auctionStateVersion !== receivedMeta.auctionStateVersion) {
      throw new Error("Payment challenge is stale for the current lot state.");
    }
  }

  private async requireLot(lotId: string, apiOrigin: string) {
    const lot = await this.repository.getLotById(lotId);
    if (!lot) {
      throw createProblemDetails({
        apiOrigin,
        slug: "lot-not-found",
        title: "Lot Not Found",
        status: 404,
        detail: "No lot exists for the supplied lotId.",
        lotId
      });
    }

    return lot;
  }

  private assertLotCanAcceptBid(
    status: string,
    bidAmount: string,
    minNextBid: string,
    lotId: string,
    apiOrigin: string
  ) {
    if (status !== "OPEN") {
      throw createProblemDetails({
        apiOrigin,
        slug: "lot-closed",
        title: "Lot Closed",
        status: 403,
        detail: "This lot is not open for bidding.",
        lotId
      });
    }

    if (BigInt(bidAmount) < BigInt(minNextBid)) {
      throw createProblemDetails({
        apiOrigin,
        slug: "bid-too-low",
        title: "Bid Too Low",
        status: 403,
        detail: "Bid must be at least the next increment.",
        lotId,
        minNextBid
      });
    }
  }

  private createSessionMethod(lot: LotRow) {
    return tempo.session({
      store: this.paymentStore,
      getClient: () => this.publicClient as never,
      account: lot.lotPayee as `0x${string}`,
      currency: this.env.QUOTE_TOKEN_ADDRESS as `0x${string}`,
      escrowContract: this.env.ESCROW_ADDRESS as `0x${string}`,
      chainId: DEFAULT_CHAIN_ID,
      minVoucherDelta: lot.bidIncrement
    });
  }

  private async buildBidChallenge(input: {
    lot: LotRow;
    body: PlaceBidRequest;
    realm: string;
  }) {
    const hintedChannelId = input.body.channelIdHint?.toLowerCase();
    const hintedOnchainChannel = hintedChannelId ? await this.readChannelFromChain(hintedChannelId) : null;
    const canReuseHintedChannel =
      hintedChannelId &&
      hintedOnchainChannel &&
      hintedOnchainChannel.payee.toLowerCase() === input.lot.lotPayee.toLowerCase() &&
      hintedOnchainChannel.token.toLowerCase() === this.env.QUOTE_TOKEN_ADDRESS.toLowerCase() &&
      !hintedOnchainChannel.finalized &&
      hintedOnchainChannel.closeRequestedAt === 0n;

    if (hintedChannelId && hintedOnchainChannel && canReuseHintedChannel) {
      await this.repository.upsertChannelSnapshot({
        channelId: hintedChannelId,
        lotId: input.lot.lotId,
        payer: hintedOnchainChannel.payer.toLowerCase(),
        authorizedSigner:
          hintedOnchainChannel.authorizedSigner.toLowerCase() === ZERO_ADDRESS
            ? null
            : hintedOnchainChannel.authorizedSigner.toLowerCase(),
        deposit: hintedOnchainChannel.deposit.toString(),
        settled: hintedOnchainChannel.settled.toString(),
        finalized: hintedOnchainChannel.finalized,
        closeRequestedAt: null
      });
    }

    const challenge = Challenge.from({
      secretKey: this.env.MPP_CHALLENGE_SECRET,
      realm: input.realm,
      method: "tempo",
      intent: "session",
      request: {
        amount: input.body.bidAmount,
        unitType: "bid-reserve-base-unit",
        suggestedDeposit: input.body.bidAmount,
        currency: this.env.QUOTE_TOKEN_ADDRESS,
        recipient: input.lot.lotPayee,
        methodDetails: {
          escrowContract: this.env.ESCROW_ADDRESS,
          ...(canReuseHintedChannel
            ? {
                channelId: hintedChannelId
              }
            : {}),
          minVoucherDelta: input.lot.bidIncrement,
          feePayer: false,
          chainId: DEFAULT_CHAIN_ID
        }
      },
      digest: BodyDigest.compute(input.body),
      expires: new Date(Date.now() + this.env.CHALLENGE_TTL_SECONDS * 1_000).toISOString(),
      meta: {
        kind: "auction-bid",
        lotId: input.lot.lotId,
        requestedBidAmount: input.body.bidAmount,
        minNextBid: input.lot.minNextBid,
        auctionStateVersion: this.buildAuctionStateVersion(input.lot)
      }
    });

    return {
      challenge,
      headerValue: Challenge.serialize(challenge)
    };
  }

  private buildAcceptedResponse(parameters: {
    lotId: string;
    channelId: string;
    payer: string;
    bidAmount: string;
    bidIncrement: string;
  }) {
    return acceptedBidResponseSchema.parse({
      lotId: parameters.lotId,
      status: "accepted",
      channelId: parameters.channelId,
      payer: parameters.payer,
      bidAmount: parameters.bidAmount,
      currentHighBidAmount: parameters.bidAmount,
      minNextBid: (BigInt(parameters.bidAmount) + BigInt(parameters.bidIncrement)).toString(),
      lotStatus: "OPEN"
    });
  }

  private buildAuctionStateVersion(lot: {
    currentHighBidAmount: string | null;
    currentHighChannelId: string | null;
    updatedAt: Date;
  }) {
    return [lot.updatedAt.getTime(), lot.currentHighBidAmount ?? "0", lot.currentHighChannelId ?? "none"].join(":");
  }

  private mapLotSummary(lot: Awaited<ReturnType<AuctionRepository["listLots"]>>[number]) {
    return {
      lotId: lot.lotId,
      externalLotId: lot.externalLotId,
      title: lot.title,
      status: lot.status,
      currentHighBidAmount: lot.currentHighBidAmount,
      minNextBid: lot.minNextBid,
      bidIncrement: lot.bidIncrement,
      endsAt: lot.endsAt?.toISOString() ?? null
    };
  }

  private mapLotDetail(lot: LotRow) {
    return lotDetailSchema.parse({
      ...this.mapLotSummary(lot),
      description: lot.description,
      lotPayee: lot.lotPayee,
      auctionHouse: this.env.AUCTION_HOUSE_ADDRESS,
      escrowContract: this.env.ESCROW_ADDRESS,
      quoteToken: this.env.QUOTE_TOKEN_ADDRESS,
      chainId: DEFAULT_CHAIN_ID,
      currentHighChannelId: lot.currentHighChannelId
    });
  }

  private async readChannelFromChain(channelId: string) {
    const channel = await readEscrowChannel(
      this.publicClient,
      this.env.ESCROW_ADDRESS as `0x${string}`,
      channelId as `0x${string}`
    );

    return channel.payer.toLowerCase() === ZERO_ADDRESS ? null : channel;
  }
}
