import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

// ESLint 9 uses flat config, but eslint-config-next 15.x still ships only the
// legacy (eslintrc) format, so FlatCompat bridges the two. This is the same
// arrangement create-next-app generates for Next 15 + ESLint 9.
//
// Note: linting had never actually run on this codebase before this config
// existed — `eslint` and `eslint-config-next` were installed with no config
// file, so `next lint` only ever offered to set itself up. Expect the first run
// to surface a backlog.

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'public/**',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      // ── Downgraded to warnings ────────────────────────────────────────────
      // CI gates on errors only (`--max-warnings` is deliberately not set), so
      // these surface in output without blocking a deploy. They are real debt
      // worth paying down, but not worth failing a release over on day one.

      // ~200 instances of `any` across the codebase. Tightening these is
      // valuable but is its own piece of work, not a CI gate.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Unused vars: warn, and allow the conventional _-prefix escape hatch.
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // The app deliberately uses <img> in places (avatars, tenant logos from
      // the API) where next/image adds no value — the sources are dynamic and
      // already correctly sized.
      '@next/next/no-img-element': 'warn',

      // ── Kept as errors ────────────────────────────────────────────────────
      // react-hooks/rules-of-hooks and exhaustive-deps stay at their default
      // error level from next/core-web-vitals. A hook-order violation is a real
      // runtime bug, not style, and this codebase has a lot of conditional
      // rendering — exactly where those break.
    },
  },
];
