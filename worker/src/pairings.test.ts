import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { getPairing } from './db';

// The browser loads js/algorithm.js as a plain script; it also exports via
// CommonJS so it can be loaded here.
const algorithm = createRequire(import.meta.url)('../../js/algorithm.js') as {
  getPairings(size: number): { pair1: number[]; pair2: number[] }[];
};

const BOX_SIZES = [4, 5, 6, 7];

describe('getPairing', () => {
  // Guards a past bug: sizes 6/7 were added to the client copy only, so those
  // boxes came back from the API with empty pairings.
  it.each(BOX_SIZES)('matches the client PAIRINGS table for a box of %i', (size) => {
    const client = algorithm.getPairings(size);
    expect(client.length).toBeGreaterThan(0);
    const server = client.map((_, i) => getPairing(size, i));
    expect(server).toEqual(client.map(({ pair1, pair2 }) => ({ pair1, pair2 })));
    expect(getPairing(size, client.length)).toEqual({ pair1: [], pair2: [] });
  });

  it.each(BOX_SIZES)('gives every player in a box of %i the same number of matches', (size) => {
    const counts = new Array(size).fill(0);
    for (let i = 0; getPairing(size, i).pair1.length; i++) {
      const players = [...getPairing(size, i).pair1, ...getPairing(size, i).pair2];
      expect(new Set(players).size).toBe(4);
      for (const p of players) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(size);
        counts[p]++;
      }
    }
    expect(new Set(counts).size).toBe(1);
  });

  it('returns empty pairs for unsupported box sizes', () => {
    expect(getPairing(3, 0)).toEqual({ pair1: [], pair2: [] });
    expect(getPairing(8, 0)).toEqual({ pair1: [], pair2: [] });
  });
});
