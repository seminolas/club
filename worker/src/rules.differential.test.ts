// Side-by-side: the rules the browser now uses vs a frozen copy of the old
// js/algorithm.js, on thousands of random inputs. Outputs must be identical,
// except live standings mid-game (MIGRATION.md, decision B), which are only
// compared where no game is part-played.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { legacy, rules } from './test/rules-under-test';
import type { Box, Score, SetPair } from './test/rules-under-test';

const RUNS = 3000;
const SIZES = [4, 5, 6, 7];
const CAPS: Record<number, number> = { 21: 30, 15: 21, 11: 15 };

// Anything a score input or the API can hold, plus junk.
const anyScore: fc.Arbitrary<Score> = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 32 }) },
  fc.constant(''),
  fc.constant(null),
  fc.integer({ min: -2, max: 40 }),
  fc.integer({ min: 0, max: 32 }).map(String),
  fc.constantFrom('x', ' ', '21.0', '1e1', 21.5, NaN),
);

// A valid set in any format, either orientation.
const validSet: fc.Arbitrary<SetPair> = fc
  .tuple(fc.constantFrom(21, 15, 11), fc.nat(1000), fc.boolean(), fc.nat(2))
  .map(([f, r, flip, kind]) => {
    const cap = CAPS[f];
    let hi: number, lo: number;
    if (kind === 0) { hi = f; lo = r % (f - 1); }
    else if (kind === 1) { lo = f - 1 + (r % (cap - f)); hi = lo + 2; }
    else { hi = cap; lo = cap - 1; }
    return (flip ? [lo, hi] : [hi, lo]) as SetPair;
  });

const won = (s: SetPair, pair1: boolean) => (Number(s[0]) > Number(s[1])) === pair1;
const setWonBy = (pair1: boolean) => validSet.filter(s => won(s, pair1));

// A finished match: best of 3 with valid sets.
const finishedMatch: fc.Arbitrary<SetPair[]> = fc
  .tuple(fc.boolean(), fc.constantFrom('WW', 'WLW', 'LWW'))
  .chain(([pair1Wins, shape]) =>
    fc.tuple(...[...shape].map(c => setWonBy(c === 'W' ? pair1Wins : !pair1Wins))));

// Any state a match can be in while scores are typed.
const anyMatch: fc.Arbitrary<SetPair[]> = fc.oneof(
  finishedMatch,
  fc.array(fc.oneof(validSet, fc.tuple(anyScore, anyScore) as fc.Arbitrary<SetPair>), { maxLength: 4 }),
  fc.constant<SetPair[]>([]),
);

const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

function boxOf(players: string[], sets: SetPair[][]): [Box, Box] {
  const make = (r: typeof rules) => {
    const [box] = r.buildBoxesFromLayout([players]);
    box.matches.forEach((m, i) => { m.sets = structuredClone(sets[i] ?? []); });
    return box;
  };
  return [make(legacy), make(rules)];
}

const boxArb = (match: fc.Arbitrary<SetPair[]>) =>
  fc.constantFrom(...SIZES).chain(size =>
    fc.tuple(fc.shuffledSubarray(names(12), { minLength: size, maxLength: size }), fc.array(match, { minLength: 7, maxLength: 7 })));

const prop = (p: fc.IProperty<unknown> | fc.IAsyncProperty<unknown>) => fc.assert(p, { numRuns: RUNS });

describe('new rules match the old ones', () => {
  it('set validity and completeness', () => {
    prop(fc.property(anyScore, anyScore, (a, b) => {
      expect(rules.isValidSet(a, b)).toBe(legacy.isValidSet(a, b));
      expect(rules.isSetComplete(a, b)).toBe(legacy.isSetComplete(a, b));
    }));
  });

  it('match status', () => {
    prop(fc.property(anyMatch, sets => {
      expect(rules.getMatchStatus({ sets })).toBe(legacy.getMatchStatus({ sets }));
    }));
  });

  it('whether a session can close', () => {
    prop(fc.property(fc.array(boxArb(fc.oneof(finishedMatch, anyMatch)), { maxLength: 4 }), boxes => {
      const pairs = boxes.map(([p, s]) => boxOf(p, s));
      expect(rules.allScoresComplete(pairs.map(b => b[1]))).toBe(legacy.allScoresComplete(pairs.map(b => b[0])));
    }));
  });

  it('box size options for 0–150 attendees', () => {
    for (let n = 0; n <= 150; n++) expect(rules.boxSizeOptions(n)).toEqual(legacy.boxSizeOptions(n));
  });

  it('pairings, sit-outs and box building', () => {
    for (let size = 0; size <= 9; size++) {
      expect(rules.getPairings(size)).toEqual(legacy.getPairings(size));
      const layout = [names(size)];
      const [a, b] = [legacy.buildBoxesFromLayout(layout), rules.buildBoxesFromLayout(layout)];
      expect(b).toEqual(a);
      for (let i = 0; i <= 8; i++) expect(rules.getSitout(b[0], i)).toEqual(legacy.getSitout(a[0], i));
    }
    prop(fc.property(fc.array(fc.string(), { maxLength: 30 }), fc.array(fc.integer({ min: 0, max: 8 }), { maxLength: 6 }), (att, sizes) => {
      expect(rules.splitBySizes(att, sizes)).toEqual(legacy.splitBySizes(att, sizes));
    }));
  });

  it('custom box layouts', () => {
    const map = new Map(names(14).map(n => [`d${n}`, n]));
    const token = fc.oneof(
      { weight: 8, arbitrary: fc.constantFrom(...map.keys()) },
      fc.constantFrom('P1', 'Nobody', '', ' ', 'dP1 ', ' dP2'),
    );
    const line = fc.array(token, { maxLength: 9 }).map(t => t.join(fc.sample(fc.constantFrom(',', ', ', ' ,'), 1)[0]));
    prop(fc.property(fc.array(line, { maxLength: 5 }), lines => {
      const text = lines.join('\n');
      expect(rules.parseBoxLayout(text, map)).toEqual(legacy.parseBoxLayout(text, map));
    }));
  });

  it('box standings when no game is part-played', () => {
    prop(fc.property(boxArb(fc.oneof(finishedMatch, fc.constant<SetPair[]>([]))), fc.option(fc.shuffledSubarray(names(12), { minLength: 12 }), { nil: null }), ([players, sets], ladder) => {
      const [a, b] = boxOf(players, sets);
      expect(rules.computeBoxStandings(b, ladder)).toEqual(legacy.computeBoxStandings(a, ladder));
    }));
  });

  it('2 up, 2 down', () => {
    prop(fc.property(fc.array(fc.constantFrom(...SIZES), { maxLength: 8 }), sizes => {
      let n = 0;
      const boxes = sizes.map(s => Array.from({ length: s }, () => `p${n++}`));
      expect(rules.buildAttendeeOrder(boxes)).toEqual(legacy.buildAttendeeOrder(boxes));
    }));
  });

  it('the ladder after closing a finished session', () => {
    // A ladder with absentees; attendees placed by an offered option or a
    // custom layout; every game finished (closing requires it).
    const session = fc.integer({ min: 4, max: 40 }).chain(attending =>
      fc.tuple(
        fc.shuffledSubarray(names(60), { minLength: 60 }),
        fc.integer({ min: 0, max: 20 }),
        fc.boolean(),
        fc.nat(),
        fc.array(fc.array(finishedMatch, { minLength: 7, maxLength: 7 }), { minLength: 12, maxLength: 12 }),
      ).map(([ladder, absent, custom, pick, sets]) => {
        const lb = ladder.slice(0, attending + absent);
        const attendees = lb.filter((_, i) => i % Math.max(2, Math.floor(lb.length / Math.max(absent, 1))) !== 1 || absent === 0).slice(0, attending);
        const options = legacy.boxSizeOptions(attendees.length);
        if (!options.length) return null;
        const sizes = options[pick % options.length].sizes;
        const order = custom ? [...attendees].sort() : attendees;
        return { lb, layout: legacy.splitBySizes(order, sizes), sets };
      }),
    ).filter(Boolean);
    prop(fc.property(session, s => {
      const { lb, layout, sets } = s!;
      const pairs = layout.map((players, i) => boxOf(players, sets[i]));
      expect(rules.applyLeaderboardUpdate(pairs.map(p => p[1]), lb)).toEqual(legacy.applyLeaderboardUpdate(pairs.map(p => p[0]), lb));
    }));
  });
});
