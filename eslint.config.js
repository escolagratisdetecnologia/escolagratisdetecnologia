import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/.astro/',
    '**/.turbo/',
    '**/coverage/',
    '**/playwright-report/',
    '**/test-results/',
    '**/.lighthouseci/',
    'infra/**/.terraform/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Código do site que roda no navegador (ilhas e scripts).
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Script clássico do <head> (sem import/export), roda antes da primeira pintura.
    files: ['apps/web/src/scripts/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
  {
    // CloudFront Functions: script clássico, o runtime chama `handler` pelo nome.
    files: ['infra/modules/edge/functions/*.js'],
    languageOptions: { sourceType: 'script', globals: {} },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^handler$' }],
    },
  },
]);
