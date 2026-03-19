# AuctionHouse MPP Build Spec (Backend + Frontend)

## 1. Product Summary

Build a web app + API for reserve-backed bidding on auction lots.

The user-facing product is a normal web app. The API is a real MPP service from day one:
- payable operation uses HTTP `402 Payment Required`
- uses `WWW-Authenticate: Payment` challenges
- accepts `Authorization: Payment ...` credentials
- uses Tempo `session` intent payloads (`open`, `topUp`, `voucher`)
- uses EIP-712 vouchers for bid authorization
- returns `Payment-Receipt` on successful paid requests
- publishes `/openapi.json` with `x-service-info` and `x-payment-info`

This is **not** a JSON-only auction API with MPP bolted on later.

## 2. Auction Rules for v0

Use the simplest auction semantics:
- ascending English auction
- first-price settlement
- winning payment equals the winner's final accepted bid
- no proxy bidding / hidden max bids
- no second-price logic
- no Dutch / sealed-bid logic

This keeps the backend and onchain settlement simple.

## 3. Contract Assumptions

Assume the smart contracts already exist and ABIs are available:
- `AuctionHouse`
- per-lot `LotPayee`
- Tempo session escrow contract

Assume each lot has one `LotPayee` address.
Assume every bidder opens a Tempo session channel with `payee = LotPayee` for that lot.
Assume the lot contract can close **exactly one** winning channel **exactly once**.

The backend does not implement contracts; it integrates with them.

## 4. Canonical Deployment Topology

### Production domains
- `app.<domain>` -> Vercel (Next.js frontend)
- `api.<domain>` -> Railway (public API)

### Railway services
- `api` -> public Fastify service
- `worker` -> private worker service
- `postgres` -> Railway Postgres

### Optional convenience rewrite
The web app may rewrite `/api/*` to `https://api.<domain>/*`, but the canonical MPP service origin is `https://api.<domain>`.

## 5. Tech Stack

### Frontend
- Next.js App Router
- TypeScript
- wagmi
- viem
- Zustand or React state for bid flow
- SWR or TanStack Query for polling

### Backend API
- Fastify
- TypeScript
- Zod
- viem
- Drizzle ORM
- Postgres
- Pino

### Worker
- TypeScript
- viem
- Drizzle
- Postgres-backed job queue (no Redis in v0)

### Shared packages
- shared types / Zod schemas
- chain ABIs + helpers
- MPP payment helpers
- DB schema package

## 6. Monorepo Layout

```text
/apps
  /web
  /api
  /worker
  /admin

/packages
  /shared
  /payment
  /chain
  /db
  /config
```

### `apps/web`
Owns UI, wallet connection, and bid UX.

### `apps/api`
Owns the public HTTP API, MPP challenge generation, credential parsing, voucher verification, bid acceptance, and OpenAPI discovery.

### `apps/worker`
Owns chain-writing jobs:
- create auction
- close auction
- execute winner
- cancel auction
- reconciliation

### `apps/admin`
Tiny CLI for admin/operator actions.

### `packages/payment`
Implements Payment HTTP auth + Tempo session helpers:
- challenge builder
- challenge verifier
- JCS canonicalization helpers
- body digest helpers
- credential parser
- voucher verifier
- receipt encoder
- Problem Details helpers

### `packages/chain`
Contains:
- ABIs
- viem public client factory
- viem wallet client factory
- escrow read helpers
- voucher EIP-712 typed-data helpers

### `packages/db`
Contains:
- Drizzle schema
- migrations
- db client

### `packages/shared`
Contains all request/response schemas used by web + api.

## 7. Public API Surface

### Free endpoints
- `GET /healthz`
- `GET /openapi.json`
- `GET /v1/lots`
- `GET /v1/lots/:lotId`
- `GET /v1/lots/:lotId/status`

### Payable endpoint
- `POST /v1/lots/:lotId/bids`

This is the only public paid operation in v0.

## 8. Lot Data Model Returned by Free Endpoints

Return these fields from `GET /v1/lots/:lotId` and `/status`:

```json
{
  "lotId": "0x...",
  "externalLotId": "uuid-or-external-id",
  "title": "Vintage Camera",
  "description": "...",
  "status": "OPEN",
  "lotPayee": "0x...",
  "auctionHouse": "0x...",
  "escrowContract": "0x...",
  "quoteToken": "0x...",
  "chainId": 42431,
  "minNextBid": "1000000",
  "currentHighBidAmount": "900000",
  "currentHighChannelId": "0x...",
  "bidIncrement": "100000",
  "endsAt": "2026-03-20T18:00:00Z"
}
```

## 9. Payable Bid Endpoint Contract

## `POST /v1/lots/:lotId/bids`

### Request headers
- `Content-Type: application/json`
- `Idempotency-Key: <required>`
- `Authorization: Payment <base64url-json>` (optional on the first attempt; required on the paid retry)

### Request body
```json
{
  "bidAmount": "1000000",
  "channelIdHint": "0x...optional...",
  "clientBidId": "optional-client-generated-id"
}
```

### Rules
- `bidAmount` is a decimal string in quote-token base units
- `channelIdHint` is optional and lets the server suggest channel reuse in the challenge
- `clientBidId` is purely for UI correlation

## 10. MPP Semantics for `POST /bids`

This route is a real MPP-protected resource.

### First request (no or insufficient credential)
The client sends the normal JSON body.
The server returns:
- `402 Payment Required`
- `WWW-Authenticate: Payment ...`
- `Content-Type: application/problem+json`
- `Cache-Control: no-store`

### Retry request
The client retries the **same** `POST /bids` request with:
- same body
- same `Idempotency-Key`
- `Authorization: Payment <credential>`

### Successful paid request
The server returns:
- `200 OK` or `201 Created`
- `Payment-Receipt: <base64url-json>`
- `Cache-Control: private`
- JSON response body describing accepted bid state

## 11. Challenge Shape for Bids

Use Payment auth with:
- `method = "tempo"`
- `intent = "session"`

### 402 challenge parameters
- `id` -> stateless HMAC-bound challenge id
- `realm` -> `api.<domain>`
- `method` -> `tempo`
- `intent` -> `session`
- `request` -> base64url(JCS(requestJson))
- `digest` -> digest of the JSON request body
- `expires` -> short TTL (recommend 90 seconds)
- `opaque` -> flat string map with auction-specific context

### Decoded `request` JSON
```json
{
  "amount": "1",
  "unitType": "bid-reserve-base-unit",
  "suggestedDeposit": "1000000",
  "currency": "0x<quote-token>",
  "recipient": "0x<lot-payee>",
  "methodDetails": {
    "escrowContract": "0x<escrow-contract>",
    "channelId": "0x<existing-channel-if-valid>",
    "minVoucherDelta": "100000",
    "feePayer": true,
    "chainId": 42431
  }
}
```

### Decoded `opaque` JSON
```json
{
  "kind": "auction-bid",
  "lotId": "0x...",
  "requestedBidAmount": "1000000",
  "minNextBid": "1000000",
  "auctionStateVersion": "42"
}
```

Notes:
- `amount = "1"` means one quote-token base unit of reserve per one base unit of bid authorization
- `suggestedDeposit` should generally equal `bidAmount`
- if `channelIdHint` is valid and belongs to this lot payee + token, echo it in `methodDetails.channelId`

## 12. Credential Actions Supported on `POST /bids`

### Supported now
- `open`
- `topUp`
- `voucher`

### Not supported in MVP on this route
- `close`

Reason:
`LotPayee` is single-use and should only close the winning channel. Losing bidders recover via `requestClose()` and `withdraw()` directly against the escrow contract from the wallet.

If a client sends `action="close"` to `/bids`, return `403` with Problem Details explaining cooperative close is unsupported for this resource.

## 13. How Bid Placement Works

### Path A: first bid, no existing channel
1. Client `POST /bids` without auth.
2. Server returns 402 challenge.
3. Client builds `open` credential:
   - signed Tempo transaction calling escrow `open(payee=lotPayee, token=quoteToken, deposit=bidAmount, salt, authorizedSigner=0x0)`
   - initial voucher with `cumulativeAmount = bidAmount`
4. Client retries same `POST /bids` with `Authorization: Payment ...`
5. Server:
   - verifies challenge binding + body digest
   - verifies `open` tx
   - adds fee payer signature if enabled
   - broadcasts tx
   - verifies channel exists and deposit is sufficient
   - verifies voucher signature
   - verifies `cumulativeAmount == bidAmount`
   - accepts bid
   - stores highest voucher for channel
   - updates lot high bid
   - returns `Payment-Receipt`

### Path B: existing channel, deposit already sufficient
1. Client `POST /bids` without auth or with stale auth.
2. Server returns 402 challenge referencing the existing channel.
3. Client signs a `voucher` with `cumulativeAmount = bidAmount`.
4. Client retries same request with `Authorization: Payment ...`
5. Server verifies voucher and accepts the bid.

### Path C: existing channel, needs more deposit
1. Client `POST /bids`.
2. Server returns 402 challenge referencing the existing channel.
3. Client signs `topUp` transaction.
4. Client retries same request with `action = topUp`.
5. Server verifies and broadcasts topUp.
6. Client signs `voucher` with `cumulativeAmount = bidAmount`.
7. Client retries same request again with `action = voucher`.
8. Server verifies voucher and accepts the bid.

## 14. Voucher Policy for v0

Keep this strict:
- for bid placement, `cumulativeAmount MUST equal bidAmount`
- do not support hidden reserve ceilings or proxy bidding
- one accepted voucher amount == one actual standing bid amount

This makes winner settlement trivial.

## 15. Bid Acceptance Rules

A bid is accepted iff:
- lot exists
- lot status is `OPEN`
- `bidAmount >= minNextBid`
- request passes MPP verification
- channel payee equals lot payee
- channel token equals quote token
- channel not finalized
- channel has no pending `closeRequestedAt`
- voucher signer equals `authorizedSigner` if non-zero, else `payer`
- voucher signature is valid EIP-712 for the escrow contract domain
- voucher uses canonical low-s signature
- `cumulativeAmount == bidAmount`
- `cumulativeAmount <= channel.deposit`
- `cumulativeAmount > previousHighestVoucherForChannel`

On accept:
- persist highest voucher for the channel
- append bid history row
- update lot current high bid + minNextBid
- return bid accepted response + `Payment-Receipt`

## 16. Successful Bid Response Body

```json
{
  "lotId": "0x...",
  "status": "accepted",
  "channelId": "0x...",
  "payer": "0x...",
  "bidAmount": "1000000",
  "currentHighBidAmount": "1000000",
  "minNextBid": "1100000",
  "lotStatus": "OPEN"
}
```

## 17. Payment Receipt Shape

Encode a Payment-Receipt header containing base64url JSON.

Required/core fields:
```json
{
  "status": "success",
  "method": "tempo",
  "intent": "session",
  "timestamp": "2026-03-19T14:00:00Z",
  "challengeId": "...",
  "channelId": "0x...",
  "acceptedCumulative": "1000000",
  "spent": "0"
}
```

Auction-specific extension fields:
```json
{
  "reservedBidAmount": "1000000",
  "standing": "highest",
  "lotId": "0x..."
}
```

`spent` remains `0` during auction bidding in v0. Final settlement happens later when the worker executes the winner close.

## 18. Error Handling

### Unpaid / insufficient auth
Return `402` with a fresh challenge.

### Invalid credential
Return `402` with fresh challenge and Problem Details.

### Channel finalized / not found
Return `410 Gone`.

### Bid too low / lot closed / policy rejection after valid payment auth
Return `403` with Problem Details.

### Malformed request
Return `400 Bad Request`.

### Example problem body
```json
{
  "type": "https://api.<domain>/problems/bid-too-low",
  "title": "Bid Too Low",
  "status": 403,
  "detail": "Bid must be at least the next increment.",
  "lotId": "0x...",
  "minNextBid": "1100000"
}
```

### 402 insufficient reserve example
```json
{
  "type": "https://paymentauth.org/problems/session/insufficient-balance",
  "title": "Insufficient Authorized Balance",
  "status": 402,
  "detail": "The current authorization does not cover the requested bid.",
  "lotId": "0x...",
  "requiredBidAmount": "1000000",
  "requiredTopUp": "100000",
  "channelId": "0x..."
}
```

## 19. OpenAPI Discovery

Serve `GET /openapi.json` from the API service.

### Top-level requirements
- OpenAPI 3.1
- `info.title`
- `info.version`
- `paths`
- optional `x-service-info`

### Include
```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "AuctionHouse AI API",
    "version": "1.0.0"
  },
  "x-service-info": {
    "categories": ["developer-tools"],
    "docs": {
      "homepage": "https://app.<domain>",
      "apiReference": "https://api.<domain>/docs",
      "llms": "https://api.<domain>/llms.txt"
    }
  },
  "paths": {
    "/v1/lots/{lotId}/bids": {
      "post": {
        "summary": "Submit an auction bid",
        "x-payment-info": {
          "intent": "session",
          "method": "tempo",
          "amount": null,
          "currency": "0x<quote-token>",
          "description": "Escrow-backed reserve for auction bidding. Runtime 402 challenge returns lot-specific payee and suggested deposit."
        },
        "responses": {
          "200": { "description": "Bid accepted" },
          "402": { "description": "Payment Required" }
        }
      }
    }
  }
}
```

## 20. Backend Modules

### `payment/challenge.ts`
Responsibilities:
- build challenge request JSON
- JCS serialize request + opaque
- base64url encode
- compute digest for request body
- build HMAC-bound challenge id
- emit `WWW-Authenticate` header

### `payment/credential.ts`
Responsibilities:
- parse `Authorization: Payment ...`
- base64url decode JSON
- validate challenge echo
- validate expiry
- validate digest match
- validate opaque echo

### `payment/session.ts`
Responsibilities:
- parse payload action
- validate open/topUp/voucher payload shapes
- reject unknown actions

### `payment/voucher.ts`
Responsibilities:
- reconstruct EIP-712 typed data
- verify low-s signature
- recover signer
- compare against on-chain expected signer

### `payment/receipt.ts`
Responsibilities:
- build receipt JSON
- base64url encode
- attach `Payment-Receipt` header

### `auction/service.ts`
Responsibilities:
- accept or reject bids
- update current high bid
- compute `minNextBid`
- create bid history rows

### `chain/escrow.ts`
Responsibilities:
- read `getChannel(channelId)`
- verify payee/token/finalized/closeRequestedAt
- broadcast open/topUp when authorized

## 21. Database Schema

### `lots`
```sql
id uuid pk
lot_id text unique
external_lot_id text unique
title text
description text
lot_payee text
status text
current_high_bid_amount text null
current_high_channel_id text null
min_next_bid text
bid_increment text
winner_channel_id text null
winning_bid_amount text null
create_tx_hash text null
close_tx_hash text null
execute_tx_hash text null
ends_at timestamptz null
created_at timestamptz
updated_at timestamptz
```

### `channels`
```sql
id uuid pk
channel_id text unique
lot_id text
payer text
authorized_signer text null
deposit text
settled text
finalized boolean
close_requested_at bigint null
latest_voucher_amount text null
latest_voucher_sig text null
created_at timestamptz
updated_at timestamptz
```

### `bids`
```sql
id uuid pk
lot_id text
channel_id text
payer text
bid_amount text
signature text
accepted boolean
reject_reason text null
created_at timestamptz
```

### `idempotency_requests`
```sql
id uuid pk
route text
idempotency_key text
request_hash text
response_status int
response_headers jsonb
response_body jsonb
created_at timestamptz
unique(route, idempotency_key)
```

### `onchain_jobs`
```sql
id uuid pk
type text
payload jsonb
status text
attempt_count int
next_run_at timestamptz
last_error text null
created_at timestamptz
updated_at timestamptz
```

### `tx_attempts`
```sql
id uuid pk
job_id uuid
tx_hash text null
status text
error text null
submitted_at timestamptz
confirmed_at timestamptz null
```

## 22. Challenge Handling Strategy

Use **stateless HMAC challenge ids**.
Do not persist challenge rows in v0.

The challenge id should bind:
- realm
- method
- intent
- request
- expires
- digest
- opaque

Use short expiry (90 seconds recommended).

## 23. Idempotency Strategy

`POST /bids` requires `Idempotency-Key`.

Behavior:
- same key + same request hash -> return cached response
- same key + different request hash -> `409 Conflict`
- cache both successful bid responses and successful open/topUp/voucher processing responses

## 24. API Service Responsibilities

The public API service owns:
- free lot reads
- bid submission
- challenge generation
- credential parsing
- open/topUp tx verification
- fee payer signing (if enabled)
- transaction broadcast for open/topUp
- voucher verification
- bid acceptance and DB writes
- OpenAPI discovery

The API service **does not** own:
- `createAuction`
- `closeAuction`
- `executeWinner`

## 25. Fee Payer Key

If `feePayer = true`, the API service must hold a dedicated `FEE_PAYER_PRIVATE_KEY`.

This key is separate from the operator key and is used only for open/topUp fee sponsorship.

The API service must:
- validate open/topUp transaction fields before fee signing
- rate limit fee sponsorship
- cap per-request fee sponsorship
- log sponsored tx hashes

## 26. Worker Responsibilities

The worker owns every privileged onchain write related to auction administration:
- `createAuction`
- `closeAuction`
- `executeWinner`
- `cancelAuction`
- reconciliation jobs

The worker holds:
- `OPERATOR_PRIVATE_KEY`

The worker does **not** accept public traffic.

## 27. Admin CLI

Provide small CLI commands:

```bash
pnpm admin:create-lot --external-id LOT-123 --title "Vintage Camera" --increment 100000
pnpm admin:close-lot --lot-id 0x... --winner-channel-id 0x... --winning-bid-amount 1200000
pnpm admin:cancel-lot --lot-id 0x...
```

### CLI behavior
- CLI writes jobs into `onchain_jobs`
- worker picks them up and submits transactions

## 28. Winner Finalization Flow

1. Off-chain auction closes.
2. Operator determines `winnerChannelId` and `winningBidAmount`.
3. Backend loads the stored highest voucher for the winner channel.
4. Worker submits `AuctionHouse.closeAuction(lotId, winnerChannelId, winningBidAmount)`.
5. Worker submits `LotPayee.executeWinner(cumulativeAmount=winningBidAmount, signature=storedSignature)`.
6. Worker records tx hashes and marks lot `SETTLED`.

Because v0 uses first-price semantics and `cumulativeAmount == bidAmount`, there is no hidden-max refund logic required beyond the escrow contract's normal `deposit - cumulativeAmount` refund.

## 29. Loser Recovery Flow

Frontend should expose a recovery path for losing bidders:
- `requestClose(channelId)` from wallet
- wait grace period
- `withdraw(channelId)` from wallet

This path goes directly to the session escrow contract.

The backend should surface enough lot/channel state for the UI to tell the user whether they won or lost.

## 30. Frontend Pages

### `/`
Simple landing page + CTA to view lots.

### `/lots`
List lots with:
- title
- current high bid
- min next bid
- status
- endsAt

### `/lots/[lotId]`
Main bidding page with:
- lot metadata
- wallet connect
- lot payee / token / chain info
- current high bid
- min next bid
- bid amount input
- “Place bid” button
- transaction / signature state
- recovery actions after lot closes
- optional debug accordion showing last challenge / receipt

## 31. Frontend Bid UX State Machine

### states
- `idle`
- `requestingChallenge`
- `received402`
- `signingOpenTx`
- `signingTopUpTx`
- `signingVoucher`
- `submittingPaidRequest`
- `accepted`
- `rejected`

### algorithm
1. User enters `bidAmount`.
2. App sends unauthenticated `POST /bids`.
3. If 200/201 unexpectedly, show result.
4. If 402:
   - parse Payment challenge
   - inspect `methodDetails.channelId`
   - inspect `suggestedDeposit`
5. Decide action:
   - no channel -> `open`
   - channel exists and deposit sufficient -> `voucher`
   - channel exists and deposit insufficient -> `topUp`, then `voucher`
6. Retry same `POST /bids` with `Authorization: Payment ...`
7. Show accepted result + receipt.

## 32. Frontend Wallet Rules

For MVP:
- use the connected wallet as both payer and voucher signer
- set `authorizedSigner = 0x0`
- do not implement delegated signer UX yet

Later:
- support delegated hot bidder key

## 33. Frontend Chain Integration

Use wagmi + viem on the client.

The frontend must be able to:
- read current channel if user has `channelId`
- sign the voucher typed data
- sign Tempo open/topUp transactions
- call escrow `requestClose()` and `withdraw()` for loser recovery

## 34. API Route Details

### `GET /healthz`
Return:
```json
{ "ok": true }
```

### `GET /v1/lots`
Return list of free lot summaries.

### `GET /v1/lots/:lotId`
Return lot detail payload.

### `GET /v1/lots/:lotId/status`
Return compact status payload for polling.

### `POST /v1/lots/:lotId/bids`
MPP-protected route as described above.

## 35. Security Requirements

- never log `Authorization: Payment`
- never log raw `Payment-Receipt`
- redact wallet signatures in app logs where possible
- send `Cache-Control: no-store` on 402 responses
- send `Cache-Control: private` on successful paid responses
- require HTTPS in production
- rate limit unauthenticated requests
- rate limit sponsored fee requests
- validate field lengths before ECDSA recovery
- persist accepted highest voucher before treating bid as accepted
- require lowercase hex normalization internally

## 36. CORS

The API should allow:
- `https://app.<domain>`
- localhost dev origins

Allowed headers:
- `Content-Type`
- `Authorization`
- `Idempotency-Key`

Expose headers:
- `Payment-Receipt`
- `WWW-Authenticate`

Also allow CORS on `/openapi.json`.

## 37. Railway Deployment

Deploy `api`, `worker`, and `postgres` in one Railway project.

### API service
- public domain enabled
- healthcheck path `/healthz`
- listens on `0.0.0.0:$PORT`

### Worker service
- private only
- no public domain

### Postgres
- Railway managed Postgres

Use private networking for service-to-service traffic.

## 38. Vercel Deployment

Deploy only the `web` app to Vercel.

Optional rewrites:
- `/api/v1/:path*` -> `https://api.<domain>/v1/:path*`
- `/openapi.json` -> `https://api.<domain>/openapi.json`

Do **not** re-implement the Railway API inside Next route handlers.

## 39. Environment Variables

### web
```env
NEXT_PUBLIC_API_ORIGIN=https://api.<domain>
NEXT_PUBLIC_CHAIN_ID=42431
NEXT_PUBLIC_ESCROW_ADDRESS=0x...
NEXT_PUBLIC_AUCTION_HOUSE_ADDRESS=0x...
NEXT_PUBLIC_QUOTE_TOKEN_ADDRESS=0x...
```

### api
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=...
RPC_URL=...
MPP_CHALLENGE_SECRET=...
FEE_PAYER_PRIVATE_KEY=0x...
AUCTION_HOUSE_ADDRESS=0x...
ESCROW_ADDRESS=0x...
QUOTE_TOKEN_ADDRESS=0x...
CORS_ORIGINS=https://app.<domain>
CHALLENGE_TTL_SECONDS=90
```

### worker
```env
NODE_ENV=production
DATABASE_URL=...
RPC_URL=...
OPERATOR_PRIVATE_KEY=0x...
AUCTION_HOUSE_ADDRESS=0x...
ESCROW_ADDRESS=0x...
QUOTE_TOKEN_ADDRESS=0x...
```

## 40. Testing Requirements

### unit tests
- challenge id binding
- JCS serialization stability
- body digest binding
- Payment credential parsing
- voucher EIP-712 verification
- low-s rejection
- `cumulativeAmount == bidAmount` policy
- idempotency replay behavior

### integration tests
- create lot
- first bid via `open`
- second bid via `voucher`
- insufficient deposit -> `topUp` then `voucher`
- reject bid below `minNextBid`
- reject channel for wrong payee
- reject finalized channel
- close lot and execute winner

### e2e tests
- browser user places first bid
- browser user raises bid
- second user outbids
- loser can initiate `requestClose`
- winner settles after operator close

## 41. Interop / Conformance Testing

Add one integration harness that exercises the API with an external MPP client implementation.

Recommended:
- use `mppx` examples / client / CLI as a black-box interop reference
- verify the API returns correct 402 challenges and accepts standard `Authorization: Payment` credentials

## 42. Acceptance Criteria

The build is done when all of the following are true:

1. `GET /openapi.json` exists and contains valid `x-payment-info` for `POST /v1/lots/{lotId}/bids`.
2. An unauthenticated `POST /bids` returns 402 with a Payment challenge.
3. A client can place a first bid with `action="open"` and initial voucher in the same paid retry.
4. A client can raise a bid with `action="voucher"` if deposit is already sufficient.
5. A client can raise a bid with `action="topUp"` then `action="voucher"` when deposit is insufficient.
6. Successful paid bid responses include `Payment-Receipt`.
7. Invalid voucher signatures produce 402 + fresh challenge.
8. Policy rejections after valid payment verification produce 403.
9. Worker can lock a winner and execute `LotPayee.executeWinner(...)`.
10. Losing users can recover funds directly through escrow `requestClose()` / `withdraw()`.

## 43. Deliberate Non-Goals for v0

Do not build:
- proxy max bidding
- second-price auctions
- websocket transport
- MCP transport
- generic smart-account abstraction
- Redis queue
- full admin dashboard
- seller onboarding flow
- cross-lot pooled channels

## 44. Recommended Build Order

1. wire repo + shared packages
2. free lot read API
3. OpenAPI discovery
4. payment challenge builder + receipt encoder
5. bid endpoint with 402 + body digest binding
6. voucher verification
7. open action support
8. topUp action support
9. frontend lot page + wallet connect
10. frontend bid state machine
11. worker + admin CLI
12. final settlement flow
13. loser recovery UI
14. interop tests

## 45. One-Line Definition of Done

A browser user can open a Tempo session channel against a lot payee, submit a bid through a real `Authorization: Payment` MPP retry on `POST /v1/lots/:lotId/bids`, see the accepted bid in the UI, and the backend can later close exactly one winning channel for settlement.
