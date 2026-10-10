import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** Bundles the Lambda handler with every dependency, AWS SDK included (versions from our lockfile). */
export async function buildLambda(outdir: string): Promise<void> {
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
