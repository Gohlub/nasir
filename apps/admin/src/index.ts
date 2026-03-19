import { createHash } from "node:crypto";

import { createDbClient, AuctionRepository } from "@nasir/db";
import { keccak256, stringToHex } from "viem";
import { z } from "zod";

const zeroAddress = "0x0000000000000000000000000000000000000000";

function getFlag(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

const createLotArgsSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  increment: z.string().regex(/^(0|[1-9]\d*)$/),
  description: z.string().optional(),
  endsAt: z.string().datetime({ offset: true }).optional()
});

const closeLotArgsSchema = z.object({
  lotId: z.string().min(1),
  winnerChannelId: z.string().min(1),
  winningBidAmount: z.string().regex(/^(0|[1-9]\d*)$/)
});

const cancelLotArgsSchema = z.object({
  lotId: z.string().min(1)
});

const executeWinnerArgsSchema = z.object({
  lotId: z.string().min(1)
});

function metadataHashFromLot(input: { externalId: string; title: string; description?: string }) {
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return `0x${digest}`;
}

async function main() {
  const [, , command, ...argv] = process.argv;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const { db, client } = createDbClient(databaseUrl);
  const repository = new AuctionRepository(db);

  if (command === "create-lot") {
    const args = createLotArgsSchema.parse({
      externalId: getFlag(argv, "--external-id"),
      title: getFlag(argv, "--title"),
      increment: getFlag(argv, "--increment"),
      description: getFlag(argv, "--description"),
      endsAt: getFlag(argv, "--ends-at")
    });

    const lotId = keccak256(stringToHex(args.externalId));
    const metadataHash = metadataHashFromLot(
      args.description
        ? {
            externalId: args.externalId,
            title: args.title,
            description: args.description
          }
        : {
            externalId: args.externalId,
            title: args.title
          }
    );

    await repository.createLotDraft({
      lotId,
      externalLotId: args.externalId,
      title: args.title,
      description: args.description ?? "",
      lotPayee: zeroAddress,
      status: "OPEN",
      minNextBid: args.increment,
      bidIncrement: args.increment,
      endsAt: args.endsAt ? new Date(args.endsAt) : null
    });

    const job = await repository.enqueueJob("create-lot", {
      lotId,
      metadataHash
    });

    console.log(`Queued create-lot job ${job.id} for ${lotId}`);
    await client.end();
    return;
  }

  if (command === "close-lot") {
    const args = closeLotArgsSchema.parse({
      lotId: getFlag(argv, "--lot-id"),
      winnerChannelId: getFlag(argv, "--winner-channel-id"),
      winningBidAmount: getFlag(argv, "--winning-bid-amount")
    });

    const job = await repository.enqueueJob("close-lot", args);
    console.log(`Queued close-lot job ${job.id} for ${args.lotId}`);
    await client.end();
    return;
  }

  if (command === "cancel-lot") {
    const args = cancelLotArgsSchema.parse({
      lotId: getFlag(argv, "--lot-id")
    });

    const job = await repository.enqueueJob("cancel-lot", args);
    console.log(`Queued cancel-lot job ${job.id} for ${args.lotId}`);
    await client.end();
    return;
  }

  if (command === "execute-winner") {
    const args = executeWinnerArgsSchema.parse({
      lotId: getFlag(argv, "--lot-id")
    });

    const lot = await repository.getLotById(args.lotId);
    if (!lot) {
      throw new Error(`Lot ${args.lotId} was not found.`);
    }

    if (!lot.winnerChannelId || !lot.winningBidAmount) {
      throw new Error(`Lot ${args.lotId} does not have a locked winner yet.`);
    }

    if (!lot.lotPayee || lot.lotPayee === zeroAddress) {
      throw new Error(`Lot ${args.lotId} does not have a valid lot payee.`);
    }

    const winningBid = await repository.getAcceptedBid(args.lotId, lot.winnerChannelId, lot.winningBidAmount);
    if (!winningBid?.signature) {
      throw new Error(
        `No accepted bid signature was found for lot ${args.lotId} at amount ${lot.winningBidAmount}.`
      );
    }

    const job = await repository.enqueueJob("execute-winner", {
      lotId: args.lotId,
      lotPayee: lot.lotPayee,
      cumulativeAmount: lot.winningBidAmount,
      signature: winningBid.signature
    });

    console.log(`Queued execute-winner job ${job.id} for ${args.lotId}`);
    await client.end();
    return;
  }

  throw new Error("Unknown command. Use create-lot, close-lot, cancel-lot, or execute-winner.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
