import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashApiKey(token: string, pepper = process.env.LOYALTY_API_KEY_PEPPER ?? "dev_pepper"): string {
  return sha256(`${pepper}:${token}`);
}

export function payloadHash(payload: unknown): string {
  return sha256(stableStringify(payload));
}

export function randomCode(prefix = "HL"): string {
  return `${prefix}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export function maskCode(code: string): string {
  if (code.length <= 6) {
    return "******";
  }

  return `${code.slice(0, 3)}***${code.slice(-4)}`;
}

export function signWebhook(secret: string, timestamp: number, rawBody: string): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | undefined,
  rawBody: string,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;

  if (!Number.isFinite(timestamp) || !signature) {
    return false;
  }

  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
