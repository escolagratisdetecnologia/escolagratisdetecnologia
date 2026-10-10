import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { loadProgressCatalog } from '../src/catalog.ts';

const CONTENT_DIR = fileURLToPath(new URL('../../../content', import.meta.url));

/**
 * Bundles the Lambda handler with every dependency, AWS SDK included (versions from our lockfile),
 * and the progress catalog read from content/.
 */
export async function buildLambda(outdir: string): Promise<void> {
  const catalog = await loadProgressCatalog(CONTENT_DIR);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/lambda.ts', import.meta.url))],
    outfile: `${outdir}/lambda.mjs`,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    minify: true,
    sourcemap: true,
    sourcesContent: false,
    define: { __PROGRESS_CATALOG__: JSON.stringify(catalog) },
    // ElectroDB is CommonJS and calls require(): give the ESM bundle a real one.
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });
}

if (import.meta.main) {
  await buildLambda(fileURLToPath(new URL('../dist', import.meta.url)));
}
