import type { FastifyInstance } from "fastify";

import type { ApiService } from "../lib/service";
import { getApiOrigin, sendProblem } from "../lib/http";
import { createProblemDetails } from "@nasir/payment";

export async function registerLotRoutes(app: FastifyInstance, service: ApiService) {
  app.get("/v1/lots", async () => service.listLots());

  app.get("/v1/lots/:lotId", async (request, reply) => {
    const lot = await service.getLot((request.params as { lotId: string }).lotId);
    if (!lot) {
      return sendProblem(
        reply,
        404,
        createProblemDetails({
          apiOrigin: getApiOrigin(request),
          slug: "lot-not-found",
          title: "Lot Not Found",
          status: 404,
          detail: "No lot exists for the supplied lotId.",
          lotId: (request.params as { lotId: string }).lotId.toLowerCase()
        })
      );
    }

    return reply.send(lot);
  });

  app.get("/v1/lots/:lotId/status", async (request, reply) => {
    const status = await service.getLotStatus((request.params as { lotId: string }).lotId);
    if (!status) {
      return sendProblem(
        reply,
        404,
        createProblemDetails({
          apiOrigin: getApiOrigin(request),
          slug: "lot-not-found",
          title: "Lot Not Found",
          status: 404,
          detail: "No lot exists for the supplied lotId.",
          lotId: (request.params as { lotId: string }).lotId.toLowerCase()
        })
      );
    }

    return reply.send(status);
  });
}

