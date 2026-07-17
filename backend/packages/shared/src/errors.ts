// Typed application errors. Throw these in domain/repo layers; the HTTP layer
// (http.ts onError) maps them to clean JSON responses. Never leak internals.
export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    statusCode: number,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const ValidationError = (
  message = "Invalid request",
  details?: unknown,
) => new AppError("VALIDATION", 400, message, details);
export const UnauthorizedError = (message = "Not authenticated") =>
  new AppError("UNAUTHORIZED", 401, message);
export const ForbiddenError = (message = "Not allowed") =>
  new AppError("FORBIDDEN", 403, message);
export const NotFoundError = (message = "Not found") =>
  new AppError("NOT_FOUND", 404, message);
export const ConflictError = (message = "Conflict") =>
  new AppError("CONFLICT", 409, message);
// 503 — a transient dependency/data gap the caller can retry (e.g. no active
// catalog version published yet). Distinct from a 500 so clients/CDNs can retry.
export const ServiceUnavailableError = (message = "Service unavailable") =>
  new AppError("SERVICE_UNAVAILABLE", 503, message);

// True for a real AppError OR any structurally-identical AppError-SHAPED error. Two reasons
// to map by shape, not identity:
//   1. A pure domain package (e.g. @sc/catalog-core) must stay free of this package's heavy
//      deps (aws-sdk / hono are pulled in by the @sc/shared barrel), so it throws an
//      AppError-shaped error of its own rather than importing AppError.
//   2. `instanceof` silently fails when a bundler ships two copies of this module — a real
//      production footgun. Shape-matching is robust to it.
// The guard is precise: only an object explicitly named "AppError" with a numeric statusCode,
// string code and string message matches — an ordinary thrown Error never does.
type AppErrorShape = { statusCode: number; code: ErrorCode; message: string; details?: unknown };
function isAppErrorShaped(err: unknown): err is AppErrorShape {
  if (err instanceof AppError) return true;
  const e = err as Record<string, unknown> | null;
  return (
    typeof e === "object" && e !== null &&
    e.name === "AppError" &&
    typeof e.statusCode === "number" &&
    typeof e.code === "string" &&
    typeof e.message === "string"
  );
}

export function toErrorBody(err: unknown): {
  statusCode: number;
  body: { error: { code: ErrorCode; message: string; details?: unknown } };
} {
  if (isAppErrorShaped(err)) {
    return {
      statusCode: err.statusCode,
      body: {
        error: { code: err.code, message: err.message, details: err.details },
      },
    };
  }
  // Unknown/unexpected — do not expose the message to clients.
  return {
    statusCode: 500,
    body: { error: { code: "INTERNAL", message: "Something went wrong" } },
  };
}
