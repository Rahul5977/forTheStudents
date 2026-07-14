import { describe, it, expect } from 'vitest';
import { AppError, NotFoundError, toErrorBody } from './errors';

describe('errors', () => {
  it('maps AppError to its status + code', () => {
    const { statusCode, body } = toErrorBody(NotFoundError('nope'));
    expect(statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('nope');
  });

  it('hides unexpected errors behind a 500', () => {
    const { statusCode, body } = toErrorBody(new Error('secret internal detail'));
    expect(statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).not.toContain('secret');
  });

  it('AppError carries structured fields', () => {
    const e = new AppError('CONFLICT', 409, 'dupe', { id: 1 });
    expect(e.statusCode).toBe(409);
    expect(e.details).toEqual({ id: 1 });
  });
});
