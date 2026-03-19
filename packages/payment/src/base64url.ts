export function encodeBase64UrlText(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function encodeBase64UrlJson(value: unknown): string {
  return encodeBase64UrlText(JSON.stringify(value));
}

export function decodeBase64UrlText(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function decodeBase64UrlJson<T>(value: string): T {
  return JSON.parse(decodeBase64UrlText(value)) as T;
}

