import { and, asc, desc, eq, lte, sql } from "drizzle-orm";

import {
  bids,
  channels,
  lots,
  onchainJobs,
  txAttempts
} from "./schema";
import type { Database } from "./client";

type AcceptedBidInput = {
  lotId: string;
  channelId: string;
  payer: string;
  authorizedSigner: string | null;
  deposit: string;
  settled: string;
  finalized: boolean;
  closeRequestedAt: bigint | null;
  bidAmount: string;
  nextMinBid: string;
  signature: string;
};

export class AuctionRepository {
  constructor(private readonly db: Database) {}

  async listLots() {
    return this.db.select().from(lots).orderBy(asc(lots.endsAt), asc(lots.createdAt));
  }

  async getLotById(lotId: string) {
    const [record] = await this.db.select().from(lots).where(eq(lots.lotId, lotId)).limit(1);
    return record ?? null;
  }

  async getLotStatus(lotId: string) {
    const [record] = await this.db
      .select({
        lotId: lots.lotId,
        status: lots.status,
        currentHighBidAmount: lots.currentHighBidAmount,
        currentHighChannelId: lots.currentHighChannelId,
        minNextBid: lots.minNextBid,
        endsAt: lots.endsAt
      })
      .from(lots)
      .where(eq(lots.lotId, lotId))
      .limit(1);

    return record ?? null;
  }

  async getChannel(channelId: string) {
    const [record] = await this.db.select().from(channels).where(eq(channels.channelId, channelId)).limit(1);
    return record ?? null;
  }

  async getAcceptedBid(lotId: string, channelId: string, bidAmount: string) {
    const [record] = await this.db
      .select()
      .from(bids)
      .where(
        and(
          eq(bids.lotId, lotId),
          eq(bids.channelId, channelId),
          eq(bids.bidAmount, bidAmount),
          eq(bids.accepted, true)
        )
      )
      .orderBy(desc(bids.createdAt))
      .limit(1);

    return record ?? null;
  }

  async upsertChannelSnapshot(input: {
    channelId: string;
    lotId: string;
    payer: string;
    authorizedSigner: string | null;
    deposit: string;
    settled: string;
    finalized: boolean;
    closeRequestedAt: bigint | null;
    latestVoucherAmount?: string | null;
    latestVoucherSig?: string | null;
  }) {
    await this.db
      .insert(channels)
      .values({
        channelId: input.channelId,
        lotId: input.lotId,
        payer: input.payer,
        authorizedSigner: input.authorizedSigner,
        deposit: input.deposit,
        settled: input.settled,
        finalized: input.finalized,
        closeRequestedAt: input.closeRequestedAt,
        latestVoucherAmount: input.latestVoucherAmount ?? null,
        latestVoucherSig: input.latestVoucherSig ?? null
      })
      .onConflictDoUpdate({
        target: channels.channelId,
        set: {
          payer: input.payer,
          authorizedSigner: input.authorizedSigner,
          deposit: input.deposit,
          settled: input.settled,
          finalized: input.finalized,
          closeRequestedAt: input.closeRequestedAt,
          latestVoucherAmount: input.latestVoucherAmount ?? null,
          latestVoucherSig: input.latestVoucherSig ?? null,
          updatedAt: new Date()
        }
      });
  }

  async recordAcceptedBid(input: AcceptedBidInput) {
    return this.db.transaction(async (tx) => {
      await tx
        .insert(channels)
        .values({
          channelId: input.channelId,
          lotId: input.lotId,
          payer: input.payer,
          authorizedSigner: input.authorizedSigner,
          deposit: input.deposit,
          settled: input.settled,
          finalized: input.finalized,
          closeRequestedAt: input.closeRequestedAt,
          latestVoucherAmount: input.bidAmount,
          latestVoucherSig: input.signature
        })
        .onConflictDoUpdate({
          target: channels.channelId,
          set: {
            payer: input.payer,
            authorizedSigner: input.authorizedSigner,
            deposit: input.deposit,
            settled: input.settled,
            finalized: input.finalized,
            closeRequestedAt: input.closeRequestedAt,
            latestVoucherAmount: input.bidAmount,
            latestVoucherSig: input.signature,
            updatedAt: new Date()
          }
        });

      await tx.insert(bids).values({
        lotId: input.lotId,
        channelId: input.channelId,
        payer: input.payer,
        bidAmount: input.bidAmount,
        signature: input.signature,
        accepted: true
      });

      await tx
        .update(lots)
        .set({
          currentHighBidAmount: input.bidAmount,
          currentHighChannelId: input.channelId,
          minNextBid: input.nextMinBid,
          updatedAt: new Date()
        })
        .where(eq(lots.lotId, input.lotId));

      const [updatedLot] = await tx.select().from(lots).where(eq(lots.lotId, input.lotId)).limit(1);
      return updatedLot ?? null;
    });
  }

  async enqueueJob(type: string, payload: Record<string, unknown>) {
    const [job] = await this.db
      .insert(onchainJobs)
      .values({
        type,
        payload,
        status: "queued"
      })
      .returning();

    if (!job) {
      throw new Error("Failed to enqueue on-chain job.");
    }

    return job;
  }

  async createLotDraft(input: {
    lotId: string;
    externalLotId: string;
    title: string;
    description?: string;
    lotPayee: string;
    status: string;
    minNextBid: string;
    bidIncrement: string;
    endsAt?: Date | null;
  }) {
    const [lot] = await this.db
      .insert(lots)
      .values({
        lotId: input.lotId,
        externalLotId: input.externalLotId,
        title: input.title,
        description: input.description ?? "",
        lotPayee: input.lotPayee,
        status: input.status,
        minNextBid: input.minNextBid,
        bidIncrement: input.bidIncrement,
        endsAt: input.endsAt ?? null
      })
      .returning();

    if (!lot) {
      throw new Error("Failed to create lot draft.");
    }

    return lot;
  }

  async getDueJobs(limit = 10) {
    return this.db
      .select()
      .from(onchainJobs)
      .where(and(eq(onchainJobs.status, "queued"), lte(onchainJobs.nextRunAt, new Date())))
      .orderBy(asc(onchainJobs.nextRunAt), asc(onchainJobs.createdAt))
      .limit(limit);
  }

  async markJobRunning(jobId: string) {
    await this.db
      .update(onchainJobs)
      .set({
        status: "running",
        attemptCount: sql`${onchainJobs.attemptCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(onchainJobs.id, jobId));
  }

  async markJobFailed(jobId: string, error: string, nextRunAt: Date) {
    await this.db
      .update(onchainJobs)
      .set({
        status: "queued",
        lastError: error,
        nextRunAt,
        updatedAt: new Date()
      })
      .where(eq(onchainJobs.id, jobId));
  }

  async markJobComplete(jobId: string) {
    await this.db
      .update(onchainJobs)
      .set({
        status: "complete",
        updatedAt: new Date()
      })
      .where(eq(onchainJobs.id, jobId));
  }

  async recordTxAttempt(input: { jobId: string; status: string; txHash?: string | null; error?: string | null }) {
    const [attempt] = await this.db
      .insert(txAttempts)
      .values({
        jobId: input.jobId,
        status: input.status,
        txHash: input.txHash ?? null,
        error: input.error ?? null
      })
      .returning();

    if (!attempt) {
      throw new Error("Failed to record transaction attempt.");
    }

    return attempt;
  }

  async updateLotAfterCreate(lotId: string, input: { lotPayee: string; txHash: string }) {
    await this.db
      .update(lots)
      .set({
        lotPayee: input.lotPayee,
        createTxHash: input.txHash,
        updatedAt: new Date()
      })
      .where(eq(lots.lotId, lotId));
  }

  async updateLotAfterClose(lotId: string, input: { txHash: string; winnerChannelId: string; winningBidAmount: string }) {
    await this.db
      .update(lots)
      .set({
        status: "WINNER_LOCKED",
        winnerChannelId: input.winnerChannelId,
        winningBidAmount: input.winningBidAmount,
        closeTxHash: input.txHash,
        updatedAt: new Date()
      })
      .where(eq(lots.lotId, lotId));
  }

  async updateLotAfterCancel(lotId: string, txHash: string) {
    await this.db
      .update(lots)
      .set({
        status: "CANCELLED",
        closeTxHash: txHash,
        updatedAt: new Date()
      })
      .where(eq(lots.lotId, lotId));
  }

  async updateLotAfterExecute(lotId: string, txHash: string) {
    await this.db
      .update(lots)
      .set({
        status: "SETTLED",
        executeTxHash: txHash,
        updatedAt: new Date()
      })
      .where(eq(lots.lotId, lotId));
  }
}
