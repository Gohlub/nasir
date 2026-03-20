import type { FastifyInstance } from "fastify";

import { getApiOrigin, sendProblem } from "../lib/http";
import type { ApiService } from "../lib/service";

export async function registerBidRoutes(app: FastifyInstance, service: ApiService) {
  app.post("/v1/lots/:lotId/bids", async (request, reply) => {
    try {
      const result = await service.handleBidRequest({
        lotId: (request.params as { lotId: string }).lotId,
        body: request.body,
        realm: request.hostname,
        apiOrigin: getApiOrigin(request),
        ...(typeof request.headers.authorization === "string"
          ? {
              authorizationHeader: request.headers.authorization
            }
          : {})
      });

      for (const [header, value] of Object.entries(result.headers)) {
        reply.header(header, value);
      }

      if (result.status >= 400 && typeof result.body === "object" && result.body !== null && "title" in result.body) {
        return sendProblem(reply, result.status, result.body as never);
      }

      return reply.code(result.status).send(result.body);
    } catch (error) {
      if (typeof error === "object" && error && "status" in error) {
        return sendProblem(reply, Number((error as { status: number }).status), error as never);
      }

      throw error;
    }
  });
}
