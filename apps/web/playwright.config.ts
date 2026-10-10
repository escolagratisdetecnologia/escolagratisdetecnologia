import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4322',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
  webServer: [
    {
      // The local API (login with Mailpit and the fake Google from `pnpm db:up`); the preview
      // below forwards /api to it, like CloudFront does in AWS.
      command: 'node ../api/src/server.ts',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      env: { APP_ENV: 'local', PORT: '3001', SITE_ORIGIN: 'http://localhost:4322' },
    },
    {
      // Astro 7 auto-backgrounds `astro preview` when it detects an AI agent; `--ignore-lock` keeps it in the foreground so Playwright owns the process.
      command: 'pnpm preview --port 4322 --ignore-lock',
      url: 'http://localhost:4322',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
