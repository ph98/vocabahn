import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      '**/dist/**',
      'node_modules',
      '**/node_modules/**',
      '.adminjs',
      '**/.adminjs/**',
      '**/*.config.*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    // Service-worker scope: hand-written vanilla JS pulled into the generated
    // worker by importScripts, so it sees worker globals rather than window's.
    files: ['apps/web/public/*-sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        clients: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
);
