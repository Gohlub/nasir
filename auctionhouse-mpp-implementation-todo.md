# AuctionHouse MPP Implementation Todo

This todo list turns the spec into implementation prompts that can be executed independently. Each item cites the relevant spec sections and, where it matters, the actual contract behavior already present in this repo.

## Contract Reality To Preserve

- `AuctionHouse.createAuction(...)` deploys exactly one `LotPayee` per lot and marks the lot `OPEN`; do not design backend flows that assume reusable payees or pooled lot routing. Contract refs: `contracts/src/AuctionHouse.sol:72-89`.
- `AuctionHouse.closeAuction(...)` only records the winner channel and clearing price, then delegates winner validation to the `LotPayee`; backend price discovery and winner selection stay off-chain. Contract refs: `contracts/src/AuctionHouse.sol:91-107`.
- `LotPayee.lockWinner(...)` rejects wrong payee, wrong token, finalized channels, already settled channels, and deposits below clearing price; backend acceptance logic must mirror those checks early for user-facing errors. Contract refs: `contracts/src/LotPayee.sol:67-85`.
- `LotPayee.executeWinner(...)` closes exactly one winning channel once, pays treasury, and refunds only the winner over-authorization; there is no on-chain loser settlement path. Contract refs: `contracts/src/LotPayee.sol:87-103`.
- The repo currently contains only the Solidity package; all application/backend/frontend infrastructure from Spec §6 and §44 still needs to be created.

## Prompt Checklist

1. Implement the monorepo skeleton described in Spec §5-§6 and §44.1 by creating `/apps/web`, `/apps/api`, `/apps/worker`, `/apps/admin`, `/packages/shared`, `/packages/payment`, `/packages/chain`, `/packages/db`, and `/packages/config`, while leaving `contracts/` intact as the on-chain source of truth. Include root workspace configuration, base TypeScript settings, package naming conventions, and scripts that line up with the `pnpm`-based operator flows in Spec §27 and §39.

2. Implement environment loading and validation for `web`, `api`, and `worker` exactly around the variables listed in Spec §39, with clear separation between public browser config and server-only secrets. Fail fast on missing required values, normalize addresses to lowercase hex internally per Spec §35, and expose a small typed config surface that the apps can share without re-parsing `process.env`.

3. Implement `packages/shared` to hold all wire-format schemas for Spec §8, §9, §16, §17, §18, and §34. Add Zod schemas and exported TypeScript types for lot summaries, lot detail payloads, lot status polling payloads, bid request bodies, accepted bid responses, problem details bodies, and any status enums that must stay identical across API and web.

4. Implement the database package from Spec §21 by defining the Drizzle schema for `lots`, `channels`, `bids`, `idempotency_requests`, `onchain_jobs`, and `tx_attempts`, then add an initial migration that matches those tables closely enough for production rollout. Preserve string storage for on-chain numeric values, use timestamps consistently, and add enough indexes/uniques to support the lookup patterns implied by Spec §23, §26, and §28.

5. Implement repository helpers around the database schema so the rest of the codebase can read and write lots, channels, bids, idempotency records, and on-chain jobs without embedding SQL in route handlers. The repository layer should support the free read endpoints in Spec §7 and §34, the bid acceptance mutation path in Spec §15, the idempotency behavior in Spec §23, and the worker job lifecycle in Spec §26-§28.

6. Implement `packages/chain` using the current contract surface plus the escrow assumptions in Spec §3, §20, §25, §26, and §33. Add ABI fragments for `AuctionHouse`, `LotPayee`, and the known escrow reads from `ITempoSessionEscrow`, provide viem public/wallet client factories, and expose helpers for fetching auction/channel state, computing channel ids, and preparing typed-data verification inputs. Do not invent settlement logic that contradicts `AuctionHouse`/`LotPayee` invariants.

7. Implement `packages/payment/challenge.ts` per Spec §10, §11, §20, §22, §35, and §36. Build stateless HMAC-bound challenge ids over `realm`, `method`, `intent`, `request`, `expires`, `digest`, and `opaque`; canonicalize JSON; emit `WWW-Authenticate: Payment ...`; and include `Cache-Control: no-store` plus CORS exposure on 402 responses.

8. Implement `packages/payment/credential.ts`, `session.ts`, and shared codec utilities per Spec §10-§12, §18, and §20. Parse `Authorization: Payment <base64url-json>`, reject malformed or expired credentials, validate that the echoed challenge fields still match the current request body digest, and distinguish `open`, `topUp`, `voucher`, and unsupported `close` actions with explicit Problem Details behavior.

9. Implement `packages/payment/voucher.ts` for Spec §14, §15, §20, §32, §33, and §40. Reconstruct the escrow EIP-712 payload, recover the signer, enforce low-s signatures, honor `authorizedSigner` when present and `payer` otherwise, and encode the v0 policy that `cumulativeAmount` must equal `bidAmount` exactly.

10. Implement `packages/payment/receipt.ts` and Problem Details helpers per Spec §17, §18, §35, and §42. Successful paid responses must include a base64url `Payment-Receipt` header with the required core fields plus the auction-specific extension fields; failure responses must use structured RFC 7807-style bodies without ever logging raw credentials or raw receipts.

11. Implement the API service foundation in `apps/api` for Spec §4, §7, §19, §24, §34, §35, §36, and §37. Create the Fastify server, health check, CORS policy, request logging/redaction, OpenAPI discovery document with `x-service-info` and `x-payment-info`, and the free lot read routes that map database records into the exact payloads described in Spec §8.

12. Implement bid-domain services in `apps/api` for Spec §13-§18 and §23-§25. The service should load the lot, compute `minNextBid`, reject closed or low bids, select the correct payment path (`open`, `voucher`, or `topUp`), verify escrow/channel compatibility, persist highest voucher state, append bid history, update the lot high bid atomically, and cache idempotent responses keyed by route plus `Idempotency-Key`.

13. Implement the unpaid-first flow on `POST /v1/lots/:lotId/bids` so an unauthenticated or insufficiently authenticated request returns a fresh `402 Payment Required` challenge instead of behaving like a normal JSON API. The challenge must carry the lot-specific `lotPayee`, quote token, optional reusable channel id, `suggestedDeposit`, and opaque auction state versioning exactly as described in Spec §10-§13 and §18.

14. Implement the paid retry flow for `action="voucher"` end-to-end first, because it exercises the cleanest version of the MPP semantics in Spec §10, §13B, §14, §15, §16, and §17. Ensure a bidder with an already-funded valid channel can sign only a voucher, retry the same request with the same body and `Idempotency-Key`, receive a 200/201 response, and get a `Payment-Receipt` header.

15. Implement the paid retry flows for `action="open"` and `action="topUp"` next, matching Spec §12, §13A, §13C, §24, and §25. Verify every fee-sponsored transaction before signing or broadcasting, keep sponsorship limits pluggable, record sponsored tx hashes, and confirm the resulting channel state before accepting a bid. If the actual Tempo write ABI differs from assumptions, stop and reconcile it instead of guessing.

16. Implement the worker service and queue processing per Spec §26, §28, §37, and §42. Poll `onchain_jobs`, submit `createAuction`, `closeAuction`, `executeWinner`, `cancelAuction`, and reconciliation jobs with the operator key, record `tx_attempts`, update lot status fields, and keep the worker private-only with no public HTTP surface.

17. Implement the admin CLI in `apps/admin` per Spec §27 by adding commands that enqueue `create-lot`, `close-lot`, and `cancel-lot` jobs into Postgres rather than submitting chain transactions directly. Validate inputs, compute any metadata hashes or payload shapes needed by the worker, and keep the CLI output terse and operator-friendly.

18. Implement the Next.js web shell in `apps/web` for Spec §30, §31, §32, §33, and §38. Build `/`, `/lots`, and `/lots/[lotId]` with a real API origin, lot polling, wallet connect placeholders, and a bidding UI that surfaces current high bid, minimum next bid, chain details, and recovery state.

19. Implement the frontend bid state machine from Spec §31 against the actual `402` challenge contract. The client should issue an unpaid `POST /bids`, parse `WWW-Authenticate`, decide between `open`, `topUp`, and `voucher`, sign the correct wallet payloads, resend the same request with `Authorization: Payment`, and expose transaction/signature progress plus the last challenge and receipt for debugging.

20. Implement losing-bidder recovery UX for Spec §29 and §33. The frontend should detect when a user is no longer the standing bidder on a closed lot, explain the loser recovery path, and offer wallet actions for escrow `requestClose(channelId)` and `withdraw(channelId)` once the exact Tempo ABI is wired in.

21. Implement unit, integration, and browser-level test coverage for the behaviors listed in Spec §40-§42. Start with challenge binding, digest stability, credential parsing, low-s rejection, and idempotency; then add bid-path tests for `voucher`, `open`, and `topUp`; then finish with a browser flow that proves the web UI can execute the MPP retry contract end-to-end.

22. Implement an interop harness for Spec §41 that drives the API as a black-box MPP service. Use an external client implementation once dependencies and fixtures are available, and verify that `POST /v1/lots/:lotId/bids` behaves like a real MPP endpoint rather than a custom auction-specific RPC.

23. Implement deployment and operator documentation for Spec §4, §37, §38, and §45 after the code paths exist. Document Railway service boundaries, Vercel rewrites, env var setup, fee payer vs operator key separation, local dev startup, and the exact manual steps required to create a lot, place bids, close a lot, execute the winner, and recover loser funds.
