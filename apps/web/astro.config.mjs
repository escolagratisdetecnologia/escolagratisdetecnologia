import preact from '@astrojs/preact';
import { serviceWorker } from './integrations/service-worker.ts';
import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [preact(), serviceWorker()],
  // CSS sempre em arquivo externo: a CSP do CloudFront não permite <style> inline.
  build: { format: 'directory', inlineStylesheets: 'never' },
  compressHTML: true,
  env: {
    schema: {
      SITE_ENV: envField.enum({
        context: 'server',
        access: 'public',
        values: ['local', 'dev', 'prod'],
        default: 'local',
      }),
      SITE_DRAFTS: envField.boolean({ context: 'server', access: 'public', default: false }),
    },
  },
  vite: {
    // Never inline scripts, fonts or images: the CSP only allows files from the site itself (ADR 0021).
    build: { assetsInlineLimit: 0 },
    server: { proxy: { '/api': 'http://localhost:3001' } },
  },
});
