import { describe, expect, it } from 'vitest';
import { getPairing } from './db';
import { legacy } from './test/rules-under-test';

describe('getPairing (server)', () => {
  // Guards a past bug: sizes 6/7 were added to a client-only copy of the
  // tables, so those boxes came back from the API with empty pairings. The
  // server now reads the shared tables; check it against the old client ones.
  it.each([4, 5, 6, 7])('matches the old client tables for a box of %i', (size) => {
    const client = legacy.getPairings(size);
    expect(client.map((_, i) => getPairing(size, i))).toEqual(client.map(({ pair1, pair2 }) => ({ pair1, pair2 })));
    expect(getPairing(size, client.length)).toEqual({ pair1: [], pair2: [] });
  });

  it('returns empty pairs for unsupported box sizes', () => {
    expect(getPairing(3, 0)).toEqual({ pair1: [], pair2: [] });
    expect(getPairing(8, 0)).toEqual({ pair1: [], pair2: [] });
  });
});
