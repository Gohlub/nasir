import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  bigint
} from "drizzle-orm/pg-core";

export const lots = pgTable("lots", {
  id: uuid("id").defaultRandom().primaryKey(),
  lotId: text("lot_id").notNull().unique(),
  externalLotId: text("external_lot_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  lotPayee: text("lot_payee").notNull(),
  status: text("status").notNull(),
  currentHighBidAmount: text("current_high_bid_amount"),
  currentHighChannelId: text("current_high_channel_id"),
  minNextBid: text("min_next_bid").notNull(),
  bidIncrement: text("bid_increment").notNull(),
  winnerChannelId: text("winner_channel_id"),
  winningBidAmount: text("winning_bid_amount"),
  createTxHash: text("create_tx_hash"),
  closeTxHash: text("close_tx_hash"),
  executeTxHash: text("execute_tx_hash"),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  lotId: text("lot_id").notNull(),
  payer: text("payer").notNull(),
  authorizedSigner: text("authorized_signer"),
  deposit: text("deposit").notNull(),
  settled: text("settled").notNull(),
  finalized: boolean("finalized").notNull().default(false),
  closeRequestedAt: bigint("close_requested_at", { mode: "bigint" }),
  latestVoucherAmount: text("latest_voucher_amount"),
  latestVoucherSig: text("latest_voucher_sig"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const bids = pgTable("bids", {
  id: uuid("id").defaultRandom().primaryKey(),
  lotId: text("lot_id").notNull(),
  channelId: text("channel_id").notNull(),
  payer: text("payer").notNull(),
  bidAmount: text("bid_amount").notNull(),
  signature: text("signature").notNull(),
  accepted: boolean("accepted").notNull().default(true),
  rejectReason: text("reject_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const onchainJobs = pgTable("onchain_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const txAttempts = pgTable("tx_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull(),
  txHash: text("tx_hash"),
  status: text("status").notNull(),
  error: text("error"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true })
});
