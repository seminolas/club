//  @ts-check
// Same rules as club-next (MIGRATION.md, S1).

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    // tsconfig.test.json covers the Worker code and the tests.
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      // tsconfig doesn't enable noUncheckedIndexedAccess, so TS treats array
      // destructuring and indexing as always-defined; this rule then flags
      // the resulting (necessary) null checks as "unnecessary".
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    ignores: [
      'eslint.config.mjs',
      'prettier.config.mjs',
      'src/test/legacy-algorithm.cjs',
      'scripts/**',
      // Generated, or copied in at build time.
      'worker-configuration.d.ts',
      'src/app/routeTree.gen.ts',
      '.legacy/**',
      'dist/**',
    ],
  },
]
