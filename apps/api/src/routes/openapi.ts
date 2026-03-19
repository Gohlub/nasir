import type { FastifyInstance } from "fastify";

import type { ApiEnv } from "@nasir/config";

import { getApiOrigin } from "../lib/http";
import { buildOpenApiDocument } from "../lib/openapi";

export async function registerOpenApiRoute(app: FastifyInstance, env: ApiEnv) {
  app.get("/openapi.json", async (request, reply) => {
    reply.header("Cache-Control", "public, max-age=60");
    return buildOpenApiDocument(env, getApiOrigin(request));
  });
}

