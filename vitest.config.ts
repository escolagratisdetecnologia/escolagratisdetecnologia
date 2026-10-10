import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      'apps/web',
      'apps/api',
      'packages/content',
      'packages/core',
      'packages/db',
      'tools/check-tags',
      'tools/tag-audit',
      { test: { name: 'infra', include: ['infra/**/*.test.ts'] } },
    ],
  },
});
