import type { FastifyInstance } from "fastify";

import { getApiOrigin } from "../lib/http";

export async function registerLlmsRoute(app: FastifyInstance) {
  app.get("/llms.txt", async (request, reply) => {
    const apiOrigin = getApiOrigin(request);
    reply.header("Content-Type", "text/plain; charset=utf-8");
    reply.header("Cache-Control", "public, max-age=300");

    return [
      "# AuctionHouse AI API",
      "",
      `API origin: ${apiOrigin}`,
      `OpenAPI: ${apiOrigin}/openapi.json`,
      "",
      "Free endpoints:",
      "- GET /healthz",
      "- GET /openapi.json",
      "- GET /v1/lots",
      "- GET /v1/lots/{lotId}",
      "- GET /v1/lots/{lotId}/status",
      "",
      "Payable endpoint:",
      "- POST /v1/lots/{lotId}/bids",
      "",
      "Bid flow:",
      "1. Send POST /v1/lots/{lotId}/bids with JSON body and Idempotency-Key.",
      "2. Expect HTTP 402 with WWW-Authenticate: Payment on the first unpaid request.",
      "3. Open or top up the Tempo session channel directly onchain if reserve is insufficient.",
      "4. Retry the exact same request with the same body and same Idempotency-Key plus Authorization: Payment.",
      "5. On success, read the Payment-Receipt response header.",
      "",
      "Current implementation notes:",
      "- Supports the voucher retry path for funded Tempo session channels.",
      "- Channel open/topUp are expected to be done directly onchain by the client or agent.",
      "- Returns 402 challenges with stateless HMAC-bound challenge ids.",
      "- Uses Tempo session intent semantics with method tempo and intent session."
    ].join("\n");
  });
}
