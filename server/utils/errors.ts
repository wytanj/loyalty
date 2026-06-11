import { createError } from "h3";
import { ZodError } from "zod";
import type { ApiErrorCode } from "./contracts";

export class LoyaltyError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "LoyaltyError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function invalidRequest(message: string, details?: unknown): LoyaltyError {
  return new LoyaltyError(400, "invalid_request", message, details);
}

export function unauthorized(message = "Bearer token is required"): LoyaltyError {
  return new LoyaltyError(401, "authentication_required", message);
}

export function forbidden(message = "API key does not have the required scope"): LoyaltyError {
  return new LoyaltyError(403, "permission_denied", message);
}

export function notFound(message = "Resource was not found"): LoyaltyError {
  return new LoyaltyError(404, "not_found", message);
}

export function idempotencyConflict(message = "Idempotency key was reused with a different payload"): LoyaltyError {
  return new LoyaltyError(409, "idempotency_conflict", message);
}

export function businessRule(code: ApiErrorCode, message: string, details?: unknown): LoyaltyError {
  return new LoyaltyError(422, code, message, details);
}

export function toH3Error(error: unknown): ReturnType<typeof createError> {
  if (error instanceof LoyaltyError) {
    return createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
      data: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      }
    });
  }

  if (error instanceof ZodError) {
    return createError({
      statusCode: 400,
      statusMessage: "Request did not match the API contract",
      data: {
        error: {
          code: "invalid_request",
          message: "Request did not match the API contract",
          details: error.flatten()
        }
      }
    });
  }

  return createError({
    statusCode: 500,
    statusMessage: "Internal loyalty service error",
    data: {
      error: {
        code: "internal_error",
        message: error instanceof Error ? error.message : "Unknown error"
      }
    }
  });
}
