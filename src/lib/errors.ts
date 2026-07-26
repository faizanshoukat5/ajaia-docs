import { NextResponse } from "next/server";

/**
 * One error type for every expected failure, carrying the HTTP status it should
 * become. Route handlers `throw` these; `handleRoute` turns them into a
 * consistent JSON envelope. Anything that is *not* an AppError is a bug, so it is
 * logged and reported as an opaque 500 rather than leaking internals.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "bad_request", message, details);

export const unauthorized = (message = "You need to sign in to do that.") =>
  new AppError(401, "unauthorized", message);

/**
 * Used for both "no access" and "not found" on documents, on purpose: a user who
 * cannot see a document should not be able to learn whether it exists.
 */
export const notFound = (message = "That document does not exist, or you do not have access to it.") =>
  new AppError(404, "not_found", message);

export const forbidden = (message: string) => new AppError(403, "forbidden", message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, "conflict", message, details);

export const payloadTooLarge = (message: string) =>
  new AppError(413, "payload_too_large", message);

export const unsupportedMediaType = (message: string) =>
  new AppError(415, "unsupported_media_type", message);

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/**
 * Wraps a route handler so every thrown error becomes a predictable JSON body.
 * The client's `apiFetch` reads `error.message` and shows it directly, which is
 * why every message above is written for a human.
 */
export async function handleRoute(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) {
      const body: ErrorBody = {
        error: { code: error.code, message: error.message, details: error.details },
      };
      return NextResponse.json(body, { status: error.status });
    }
    console.error("[ajaia-docs] unhandled route error:", error);
    const body: ErrorBody = {
      error: { code: "internal_error", message: "Something went wrong on our end." },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
