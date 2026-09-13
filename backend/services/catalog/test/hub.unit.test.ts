// Phase 12: the hub serving layer, without DynamoDB — the bundle is inlined at import time.
import { describe, it, expect } from 'vitest';
import { getHubSection, hubVersion, rosterFor, institutFromRoster } from '../src/domain/hub';

describe('hub domain', () => {
  it('loads the committed bundle and exposes its version + roster', () => {
    expect(hubVersion()).toBeTruthy();
    expect(rosterFor('iit-bombay')?.type).toBe('IIT');
    expect(rosterFor('iiit-hyderabad')?.inCutoffs).toBe(false);
    expect(rosterFor('nope')).toBeNull();
  });

  it('rejects unknown sections with a 400-shaped error and unknown institutes with 404', () => {
    expect(() => getHubSection('iit-bombay', 'nope')).toThrow(/Unknown hub section/);
    let err: unknown;
    try { getHubSection('not-a-college', 'fees'); } catch (e) { err = e; }
    expect((err as { statusCode?: number }).statusCode).toBe(404);
  });

  it('builds an institute header from a roster row for own-entrance institutes', () => {
    const r = rosterFor('iiit-hyderabad')!;
    const h = institutFromRoster(r);
    expect(h).toMatchObject({ id: 'iiit-hyderabad', type: 'IIIT', exam: 'other', state: 'Telangana', nirf: null });
  });
});
