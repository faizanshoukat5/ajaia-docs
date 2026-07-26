import type { ErrorBody } from "./errors";

/**
 * Thin fetch wrapper for the browser.
 *
 * Every route answers errors as `{ error: { code, message } }` with a message
 * written for a human, so the UI can surface `error.message` directly instead of
 * inventing its own copy per call site.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { "content-type": "application/json" }
          : {}),
        ...init?.headers,
      },
    });
  } catch {
    // A rejected fetch is a transport failure, not an HTTP error.
    throw new ApiError(0, "network_error", "Could not reach the server. Check your connection.");
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    let code = "unknown";
    try {
      const body = (await response.json()) as ErrorBody;
      if (body?.error?.message) message = body.error.message;
      if (body?.error?.code) code = body.error.code;
    } catch {
      // Non-JSON error body (e.g. a proxy's HTML 502). Keep the generic message.
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
