import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { generateSW } from 'workbox-build';

/** Generates /sw.js after the build with Workbox; the runtime goes to its own file (ADR 0021). */
export function serviceWorker(): AstroIntegration {
  return {
    name: 'egt-service-worker',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const { count, size, warnings } = await generateSW({
          globDirectory: root,
          // App shell only: styles, scripts, the title font, the mark and the offline page.
          globPatterns: ['_astro/*.{css,js}', 'fonts/*.woff2', 'brand/*.svg', 'offline/index.html'],
          swDest: `${root}/sw.js`,
          mode: 'production',
          sourcemap: false,
          inlineWorkboxRuntime: false,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              // Pages the learner opened stay available offline; others fall back to /offline/.
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'paginas',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 60 },
                precacheFallback: { fallbackURL: '/offline/index.html' },
              },
            },
          ],
        });
        for (const warning of warnings) logger.warn(warning);
        logger.info(`service worker: ${count} files precached (${Math.round(size / 1024)} KB)`);
      },
    },
  };
}
