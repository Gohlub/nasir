import type { FastifyReply, FastifyRequest } from "fastify";

import type { ProblemDetails } from "@nasir/shared";

export function getApiOrigin(request: FastifyRequest): string {
  const host = request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost:3000";
  const protocol = request.headers["x-forwarded-proto"] ?? request.protocol;
  return `${protocol}://${host}`;
}

export function sendProblem(reply: FastifyReply, statusCode: number, problem: ProblemDetails, headers?: Record<string, string>) {
  reply.code(statusCode).header("Content-Type", "application/problem+json");

  for (const [header, value] of Object.entries(headers ?? {})) {
    reply.header(header, value);
  }

  return reply.send(problem);
}

