import { loadWorkerEnv } from "@nasir/config";
import { buildCancelAuctionData, buildCloseAuctionData, buildCreateAuctionData, buildExecuteWinnerData, createTempoPublicClient, createTempoWalletClient, readAuction } from "@nasir/chain";
import { createDbClient, AuctionRepository } from "@nasir/db";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

import { onchainJobPayloadSchema } from "./jobs";

const DEFAULT_CHAIN_ID = 42431;
const POLL_INTERVAL_MS = 5_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function enqueueWinnerExecutionFromStoredBid(
  repository: AuctionRepository,
  input: {
    lotId: string;
    winnerChannelId: string;
    winningBidAmount: string;
  }
) {
  const lot = await repository.getLotById(input.lotId);
  if (!lot) {
    throw new Error(`Cannot enqueue execute-winner: lot ${input.lotId} was not found.`);
  }

  if (!lot.lotPayee || lot.lotPayee === ZERO_ADDRESS) {
    throw new Error(`Cannot enqueue execute-winner: lot ${input.lotId} does not have a deployed lot payee yet.`);
  }

  const winningBid = await repository.getAcceptedBid(input.lotId, input.winnerChannelId, input.winningBidAmount);
  if (!winningBid?.signature) {
    throw new Error(
      `Cannot enqueue execute-winner: no accepted bid signature was found for lot ${input.lotId} at amount ${input.winningBidAmount}.`
    );
  }

  return repository.enqueueJob("execute-winner", {
    lotId: input.lotId,
    lotPayee: lot.lotPayee,
    cumulativeAmount: input.winningBidAmount,
    signature: winningBid.signature
  });
}

async function main() {
  const env = loadWorkerEnv();
  const { db, client } = createDbClient(env.DATABASE_URL);
  const repository = new AuctionRepository(db);
  const account = privateKeyToAccount(env.OPERATOR_PRIVATE_KEY as Hex);
  const publicClient = createTempoPublicClient(DEFAULT_CHAIN_ID, env.RPC_URL);
  const walletClient = createTempoWalletClient(DEFAULT_CHAIN_ID, env.RPC_URL, account);

  async function processJob(job: Awaited<ReturnType<AuctionRepository["getDueJobs"]>>[number]) {
    await repository.markJobRunning(job.id);

    try {
      const parsed = onchainJobPayloadSchema.parse({
        type: job.type,
        payload: job.payload
      });

      if (parsed.type === "create-lot") {
        const data = buildCreateAuctionData(parsed.payload.lotId as Hex, parsed.payload.metadataHash as Hex);
        const txHash = await walletClient.sendTransaction({
          to: env.AUCTION_HOUSE_ADDRESS as Address,
          data
        });
        await repository.recordTxAttempt({ jobId: job.id, status: "submitted", txHash });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        const auction = await readAuction(publicClient, env.AUCTION_HOUSE_ADDRESS as Address, parsed.payload.lotId as Hex);
        await repository.updateLotAfterCreate(parsed.payload.lotId, {
          lotPayee: String(auction.lotPayee).toLowerCase(),
          txHash
        });
        await repository.markJobComplete(job.id);
        return;
      }

      if (parsed.type === "close-lot") {
        const data = buildCloseAuctionData(
          parsed.payload.lotId as Hex,
          parsed.payload.winnerChannelId as Hex,
          parsed.payload.winningBidAmount
        );
        const txHash = await walletClient.sendTransaction({
          to: env.AUCTION_HOUSE_ADDRESS as Address,
          data
        });
        await repository.recordTxAttempt({ jobId: job.id, status: "submitted", txHash });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        await repository.updateLotAfterClose(parsed.payload.lotId, {
          txHash,
          winnerChannelId: parsed.payload.winnerChannelId,
          winningBidAmount: parsed.payload.winningBidAmount
        });
        await enqueueWinnerExecutionFromStoredBid(repository, {
          lotId: parsed.payload.lotId,
          winnerChannelId: parsed.payload.winnerChannelId,
          winningBidAmount: parsed.payload.winningBidAmount
        });
        await repository.markJobComplete(job.id);
        return;
      }

      if (parsed.type === "cancel-lot") {
        const data = buildCancelAuctionData(parsed.payload.lotId as Hex);
        const txHash = await walletClient.sendTransaction({
          to: env.AUCTION_HOUSE_ADDRESS as Address,
          data
        });
        await repository.recordTxAttempt({ jobId: job.id, status: "submitted", txHash });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        await repository.updateLotAfterCancel(parsed.payload.lotId, txHash);
        await repository.markJobComplete(job.id);
        return;
      }

      if (parsed.type === "execute-winner") {
        const data = buildExecuteWinnerData(parsed.payload.cumulativeAmount, parsed.payload.signature as Hex);
        const txHash = await walletClient.sendTransaction({
          to: parsed.payload.lotPayee as Address,
          data
        });
        await repository.recordTxAttempt({ jobId: job.id, status: "submitted", txHash });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        await repository.updateLotAfterExecute(parsed.payload.lotId, txHash);
        await repository.markJobComplete(job.id);
        return;
      }

      await repository.markJobComplete(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown worker error";
      await repository.recordTxAttempt({ jobId: job.id, status: "failed", error: message });
      await repository.markJobFailed(job.id, message, new Date(Date.now() + POLL_INTERVAL_MS));
    }
  }

  for (;;) {
    const jobs = await repository.getDueJobs(10);
    for (const job of jobs) {
      await processJob(job);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
