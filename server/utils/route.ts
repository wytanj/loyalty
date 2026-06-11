import {
  defineEventHandler,
  getHeader,
  getQuery,
  getRouterParam,
  readBody,
  readRawBody,
  type EventHandler,
  type H3Event
} from "h3";
import { z } from "zod";
import { hashApiKey, payloadHash, verifyWebhookSignature } from "./crypto";
import { type ApiScope, idempotencyKeySchema, requestContextSchema } from "./contracts";
import { forbidden, idempotencyConflict, invalidRequest, toH3Error, unauthorized } from "./errors";
import { useLoyaltyStore } from "./store";

export function defineLoyaltyHandler<T>(handler: (event: H3Event) => Promise<T> | T): EventHandler {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event);
    } catch (error) {
      throw toH3Error(error);
    }
  });
}

export function routeParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name);
  if (!value) {
    throw invalidRequest(`Missing route parameter ${name}`);
  }

  return decodeURIComponent(value);
}

export function parseQueryContext(event: H3Event): z.infer<typeof requestContextSchema> {
  return requestContextSchema.parse(getQuery(event));
}

export async function readSchema<TSchema extends z.ZodTypeAny>(
  event: H3Event,
  schema: TSchema
): Promise<z.output<TSchema>> {
  const body = await readBody(event);
  return schema.parse(body);
}

export async function requireApiKey(event: H3Event, scopes: ApiScope[], programId?: string): Promise<void> {
  const authorization = getHeader(event, "authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : undefined;

  if (!token) {
    throw unauthorized();
  }

  const apiKey = useLoyaltyStore().findApiKeyByHash(hashApiKey(token));
  if (!apiKey) {
    throw unauthorized("API key is invalid");
  }

  if (programId && apiKey.program_id && apiKey.program_id !== programId) {
    throw forbidden("API key is not scoped to this program");
  }

  const isAdmin = apiKey.scopes.includes("loyalty:admin");
  const hasScopes = scopes.every((scope) => apiKey.scopes.includes(scope));
  if (!isAdmin && !hasScopes) {
    throw forbidden();
  }

  event.context.apiKey = {
    id: apiKey.id,
    workspace_id: apiKey.workspace_id,
    program_id: apiKey.program_id,
    scopes: apiKey.scopes
  };
}

export async function runIdempotent<T>(
  event: H3Event,
  programId: string,
  route: string,
  body: unknown,
  handler: (idempotencyKey: string) => Promise<T> | T
): Promise<T> {
  const headerKey = getHeader(event, "idempotency-key") ?? getHeader(event, "x-idempotency-key");
  const bodyKey =
    body && typeof body === "object" && "idempotency_key" in body && typeof body.idempotency_key === "string"
      ? body.idempotency_key
      : undefined;
  const parsedKey = idempotencyKeySchema.safeParse(headerKey ?? bodyKey);

  if (!parsedKey.success) {
    throw invalidRequest("Write requests require an Idempotency-Key header or idempotency_key body field");
  }

  const idempotencyKey = parsedKey.data;
  const hash = payloadHash({ route, body });
  const existing = useLoyaltyStore().getIdempotency(programId, idempotencyKey);

  if (existing) {
    if (existing.route !== route || existing.payload_hash !== hash) {
      throw idempotencyConflict();
    }

    return existing.response_body as T;
  }

  const response = await handler(idempotencyKey);
  useLoyaltyStore().saveIdempotency({
    program_id: programId,
    key: idempotencyKey,
    route,
    payload_hash: hash,
    status_code: 200,
    response_body: response,
    created_at: new Date().toISOString()
  });

  return response;
}

export async function readSignedWebhookBody(
  event: H3Event,
  secret: string
): Promise<Record<string, unknown>> {
  const rawBody = (await readRawBody(event, "utf8")) ?? "";
  const signature = getHeader(event, "x-loyalty-signature");

  if (!verifyWebhookSignature(secret, signature, rawBody)) {
    throw unauthorized("Webhook signature is invalid");
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Webhook body must be an object");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    throw invalidRequest(error instanceof Error ? error.message : "Webhook body must be valid JSON");
  }
}
