import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      'apps/api',
      'packages/content',
      'packages/core',
      'tools/check-tags',
      'tools/tag-audit',
      { test: { name: 'infra', include: ['infra/**/*.test.ts'] } },
    ],
  },
});
