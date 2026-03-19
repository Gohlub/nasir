# Nasir AuctionHouse MPP

This repository now contains:

- `contracts/`: the existing `AuctionHouse` and `LotPayee` Solidity contracts.
- `apps/api`: a Fastify API with free lot endpoints, OpenAPI discovery, and an MPP-style bid route that emits `402 Payment Required` challenges and accepts the voucher retry path.
- `apps/web`: a Next.js App Router frontend for browsing lots and exercising the challenge/retry flow.
- `apps/worker`: a private worker loop for queued on-chain jobs.
- `apps/admin`: a small CLI that enqueues create/close/cancel/execute winner jobs.
- `packages/*`: shared config, schemas, payment helpers, chain helpers, and the Drizzle schema/repository layer.

## Current State

Implemented in this first pass:

- Workspace scaffolding for the spec monorepo layout.
- Drizzle schema and initial SQL migration for lots, channels, bids, idempotency, jobs, and tx attempts.
- Fastify routes for `GET /healthz`, `GET /openapi.json`, `GET /v1/lots`, `GET /v1/lots/:lotId`, `GET /v1/lots/:lotId/status`, and `POST /v1/lots/:lotId/bids`.
- Stateless HMAC payment challenge building, credential parsing, receipt encoding, and voucher verification helpers.
- A database-backed accepted-bid flow for the `voucher` retry path.
- Live escrow channel reads on the API path so bid acceptance mirrors onchain payee/token/finalization state.
- A Next.js frontend that performs the unpaid bid request, parses the 402 challenge, and can submit a voucher retry.
- Admin job enqueueing and worker-side contract call construction for create/close/cancel/execute flows.
- Automatic execute-winner enqueueing after a successful close when a matching accepted bid signature exists in the database.

Still intentionally incomplete:

- API-managed sponsorship/broadcast for `action="open"` and `action="topUp"`. This build assumes clients or AI agents perform channel funding directly onchain, then use the API for voucher-backed bid authorization.
- Wallet-native signing UX in the frontend. The current UI exposes the voucher retry as a developer-oriented form.
- Full end-to-end deployment verification against a real Postgres database and live Tempo contracts.

## Local Setup

1. Install `pnpm`. This environment did not have it available.
2. Install workspace dependencies.
3. Provision Postgres and export the env files described below.
4. Run the database migration in `packages/db/migrations/0001_init.sql`.
5. Start the API, web app, and worker in separate terminals.

Suggested commands once `pnpm` is available:

```bash
pnpm install
pnpm --filter @nasir/api dev
pnpm --filter @nasir/web dev
pnpm --filter @nasir/worker dev
```

## Environment Files

Copy these into local `.env` files as needed:

- [`.env.web.example`](/Users/samuelhenriquez/projects/nasir/.env.web.example)
- [`.env.api.example`](/Users/samuelhenriquez/projects/nasir/.env.api.example)
- [`.env.worker.example`](/Users/samuelhenriquez/projects/nasir/.env.worker.example)

## Implementation Plan Artifact

The prompt-grade spec-linked todo list lives at [auctionhouse-mpp-implementation-todo.md](/Users/samuelhenriquez/projects/nasir/auctionhouse-mpp-implementation-todo.md).
