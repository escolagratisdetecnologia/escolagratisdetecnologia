import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'ignore',
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
    },
  },
  vite: {
    server: { proxy: { '/api': 'http://localhost:3001' } },
  },
});
