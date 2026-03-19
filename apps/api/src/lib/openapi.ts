import type { ApiEnv } from "@nasir/config";

export function buildOpenApiDocument(env: ApiEnv, apiOrigin: string) {
  const appOrigin = env.CORS_ORIGINS.split(",")[0]?.trim() ?? "https://app.example.com";

  return {
    openapi: "3.1.0",
    info: {
      title: "AuctionHouse AI API",
      version: "1.0.0"
    },
    "x-service-info": {
      categories: ["developer-tools"],
      docs: {
        homepage: appOrigin,
        apiReference: `${apiOrigin}/docs`,
        llms: `${apiOrigin}/llms.txt`
      }
    },
    paths: {
      "/v1/lots": {
        get: {
          summary: "List auction lots",
          responses: {
            "200": { description: "Lot list" }
          }
        }
      },
      "/v1/lots/{lotId}": {
        get: {
          summary: "Get lot details",
          responses: {
            "200": { description: "Lot details" },
            "404": { description: "Lot not found" }
          }
        }
      },
      "/v1/lots/{lotId}/status": {
        get: {
          summary: "Get lot status",
          responses: {
            "200": { description: "Lot status" },
            "404": { description: "Lot not found" }
          }
        }
      },
      "/v1/lots/{lotId}/bids": {
        post: {
          summary: "Submit an auction bid",
          "x-payment-info": {
            intent: "session",
            method: "tempo",
            amount: null,
            currency: env.QUOTE_TOKEN_ADDRESS,
            description:
              "Escrow-backed reserve for auction bidding. Runtime 402 challenge returns lot-specific payee and suggested deposit."
          },
          responses: {
            "200": { description: "Bid accepted" },
            "201": { description: "Bid accepted" },
            "402": { description: "Payment Required" }
          }
        }
      }
    }
  };
}

