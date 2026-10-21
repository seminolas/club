import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import * as algorithm from './algorithm';

describe('browser bundle', () => {
  it('exposes every rules function js/app.js calls as a global', () => {
    // Same options as the build:web script, built in memory.
    const { outputFiles } = buildSync({
      entryPoints: [fileURLToPath(new URL('./index.ts', import.meta.url).href)],
      bundle: true, format: 'iife', target: 'es2020', write: false,
    });
    const window: Record<string, unknown> = {};
    runInContext(outputFiles[0].text, createContext(window));
    for (const name of Object.keys(algorithm)) expect(typeof window[name], name).toBe('function');
    expect(Object.keys(algorithm)).toEqual(expect.arrayContaining([
      'getSitout', 'boxSizeOptions', 'splitBySizes', 'buildBoxesFromLayout', 'parseBoxLayout',
      'computeBoxStandings', 'isValidSet', 'isSetComplete', 'getMatchStatus', 'allScoresComplete',
      'applyLeaderboardUpdate', 'nextTuesday', 'formatDate',
    ]));
  });
});
