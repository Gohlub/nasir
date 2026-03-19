import { createHash } from "node:crypto";

import { canonicalizeJson } from "./jcs";
import { encodeBase64UrlText } from "./base64url";

export function createJsonBodyDigest(body: unknown): string {
  const canonicalBody = typeof body === "string" ? body : canonicalizeJson(body);
  const digest = createHash("sha256").update(canonicalBody, "utf8").digest("base64url");
  return `sha-256=:${digest}:`;
}

export function hashRequestForIdempotency(body: unknown): string {
  const canonicalBody = typeof body === "string" ? body : canonicalizeJson(body);
  return encodeBase64UrlText(createHash("sha256").update(canonicalBody, "utf8").digest("hex"));
}

