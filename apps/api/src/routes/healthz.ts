import type { FastifyInstance } from "fastify";

export async function registerHealthzRoute(app: FastifyInstance) {
  app.get("/healthz", async () => ({ ok: true }));
}

