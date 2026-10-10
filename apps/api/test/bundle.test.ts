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
  method = 'GET',
): { statusCode: number; body: string } {
  const event = {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'api.example', ...headers },
    requestContext: { http: { method, path, sourceIp: '127.0.0.1' } },
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
      USER_POOL_ID: 'sa-east-1_Teste123',
      USER_POOL_CLIENT_ID: 'cliente',
      USER_POOL_CLIENT_SECRET: 'segredo-do-cliente',
      AUTH_DOMAIN: 'auth.example.com',
      AWS_REGION: 'sa-east-1',
      POWERTOOLS_LOG_LEVEL: 'SILENT',
    },
  });
  return JSON.parse(output) as { statusCode: number; body: string };
}

/** Loads the triggers bundle and hands it a Cognito event. */
function trigger(event: Record<string, unknown>): Record<string, unknown> {
  const script = `
    const { handler } = await import(${JSON.stringify(pathToFileURL(join(outdir, 'triggers.mjs')).href)});
    process.stdout.write(JSON.stringify(await handler(${JSON.stringify(event)})));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, AWS_REGION: 'sa-east-1', POWERTOOLS_LOG_LEVEL: 'SILENT' },
  });
  return JSON.parse(output) as Record<string, unknown>;
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

  it.each(['/api/./auth/email/start', '/api/%61uth/email/start'])(
    'answers 404 JSON for the non-canonical path %s',
    (path) => {
      const response = invoke(
        path,
        { 'x-origin-verify': 'segredo', 'content-type': 'application/json' },
        'POST',
      );

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({
        error: { code: 'not_found', message: 'Rota não encontrada.' },
      });
    },
  );

  it('refuses requests that skip CloudFront', () => {
    expect(invoke('/api/health', {}).statusCode).toBe(403);
  });

  it('includes the Cognito triggers', () => {
    const result = trigger({
      triggerSource: 'CustomMessage_SignUp',
      userPoolId: 'sa-east-1_Teste123',
      userName: 'uuid',
      request: { userAttributes: {}, codeParameter: '{####}' },
      response: {},
    });

    expect(result.response).toMatchObject({
      emailSubject: 'Seu código para entrar na Escola Grátis de Tecnologia',
    });
  });

  it('checks the session with Cognito', () => {
    const response = invoke('/api/me', { 'x-origin-verify': 'segredo', cookie: 'egt_at=lixo' });

    expect(response.statusCode).toBe(401);
  });
});
