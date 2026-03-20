import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";

import { createTempoPublicClient } from "@nasir/chain";
import { loadApiEnv, splitCorsOrigins, type ApiEnv } from "@nasir/config";
import { createDbClient, AuctionRepository } from "@nasir/db";
import type { PublicClient } from "viem";

import { registerBidRoutes } from "./routes/bids";
import { registerHealthzRoute } from "./routes/healthz";
import { registerLlmsRoute } from "./routes/llms";
import { registerLotRoutes } from "./routes/lots";
import { registerOpenApiRoute } from "./routes/openapi";
import { DEFAULT_CHAIN_ID } from "./lib/constants";
import { ApiService } from "./lib/service";

type BuildApiAppOptions = {
  env?: ApiEnv;
  repository?: AuctionRepository;
  publicClient?: PublicClient;
  onClose?: () => Promise<void>;
};

export function buildApiApp(options: BuildApiAppOptions = {}) {
  const env = options.env ?? loadApiEnv();
  const dbClient = options.repository ? null : createDbClient(env.DATABASE_URL);
  const repository = options.repository ?? new AuctionRepository(dbClient!.db);
  const publicClient = options.publicClient ?? createTempoPublicClient(DEFAULT_CHAIN_ID, env.RPC_URL);
  const service = new ApiService(env, repository, publicClient);

  const loggerOptions = {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    redact: {
      paths: ["req.headers.authorization", "res.headers['payment-receipt']"],
      censor: "[redacted]"
    },
    ...(env.NODE_ENV === "production"
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true
            }
          }
        })
  };

  const app: FastifyInstance = Fastify({
    logger: loggerOptions
  });

  app.register(cors, {
    origin: splitCorsOrigins(env.CORS_ORIGINS),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Payment-Receipt", "WWW-Authenticate"]
  });

  app.addHook("onClose", async () => {
    if (options.onClose) {
      await options.onClose();
    }

    if (dbClient) {
      await dbClient.client.end();
    }
  });

  void registerHealthzRoute(app);
  void registerLlmsRoute(app);
  void registerOpenApiRoute(app, env);
  void registerLotRoutes(app, service);
  void registerBidRoutes(app, service);

  return app;
}
