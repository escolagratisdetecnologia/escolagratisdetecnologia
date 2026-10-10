import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildLambda } from '../scripts/build.ts';

const outdir = mkdtempSync(join(tmpdir(), 'egt-api-bundle-'));

/** Loads the real bundle in a separate Node, the way Lambda does, and sends it one event. */
function invoke(
  path: string,
  headers: Record<string, string>,
): { statusCode: number; body: string } {
  const event = {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'api.example', ...headers },
    requestContext: { http: { method: 'GET', path, sourceIp: '127.0.0.1' } },
    isBase64Encoded: false,
  };
  const script = `
    const { handler } = await import(${JSON.stringify(pathToFileURL(join(outdir, 'lambda.mjs')).href)});
    const response = await handler(${JSON.stringify(event)}, { awsRequestId: 'test', functionName: 'test' });
    process.stdout.write(JSON.stringify(response));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      APP_ENV: 'dev',
      APP_VERSION: 'test',
      TABLE_NAME: 'egt-test-data-main',
      SITE_ORIGIN: 'https://example.com',
      ORIGIN_VERIFY_SECRET: 'segredo',
      AWS_REGION: 'sa-east-1',
      POWERTOOLS_LOG_LEVEL: 'SILENT',
    },
  });
  return JSON.parse(output) as { statusCode: number; body: string };
}

describe('Lambda bundle', () => {
  beforeAll(async () => {
    await buildLambda(outdir);
  }, 60_000);

  it('loads and answers API Gateway events', () => {
    const response = invoke('/api/nao-existe', { 'x-origin-verify': 'segredo' });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      error: { code: 'not_found', message: 'Rota não encontrada.' },
    });
  });

  it('refuses requests that skip CloudFront', () => {
    expect(invoke('/api/health', {}).statusCode).toBe(403);
  });
});
