// Typed application errors. Throw these in domain/repo layers; the HTTP layer
// (http.ts onError) maps them to clean JSON responses. Never leak internals.
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const ValidationError = (message = 'Invalid request', details?: unknown) =>
  new AppError('VALIDATION', 400, message, details);
export const UnauthorizedError = (message = 'Not authenticated') =>
  new AppError('UNAUTHORIZED', 401, message);
export const ForbiddenError = (message = 'Not allowed') =>
  new AppError('FORBIDDEN', 403, message);
export const NotFoundError = (message = 'Not found') =>
  new AppError('NOT_FOUND', 404, message);
export const ConflictError = (message = 'Conflict') =>
  new AppError('CONFLICT', 409, message);

export function toErrorBody(err: unknown): { statusCode: number; body: { error: { code: ErrorCode; message: string; details?: unknown } } } {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, body: { error: { code: err.code, message: err.message, details: err.details } } };
  }
  // Unknown/unexpected — do not expose the message to clients.
  return { statusCode: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong' } } };
}
