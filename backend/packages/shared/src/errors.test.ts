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

  it('maps a foreign AppError-SHAPED error by structure (cross-package / cross-bundle safe)', () => {
    // Mimics @sc/catalog-core's local validation error: identical shape, different class
    // identity (so `instanceof AppError` is false). It must still map to its real status.
    const shim = Object.assign(new Error('Invalid predictor input: advRank must be at least 1'), {
      name: 'AppError', statusCode: 400, code: 'VALIDATION', details: { fields: ['advRank'] },
    });
    const { statusCode, body } = toErrorBody(shim);
    expect(statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION');
    expect(body.error.details).toEqual({ fields: ['advRank'] });
  });

  it('does NOT treat a plain Error with a stray statusCode as an app error', () => {
    // name !== 'AppError' → not matched → hidden behind a 500 (no false positives).
    const { statusCode, body } = toErrorBody(Object.assign(new Error('secret'), { statusCode: 400 }));
    expect(statusCode).toBe(500);
    expect(body.error.message).not.toContain('secret');
  });
});
