import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type QueryString = Record<string, { value: string; multiValue?: { value: string }[] }>;
interface CfRequest {
  uri: string;
  headers: Record<string, { value: string }>;
  querystring: QueryString;
}

// Same substitutions Terraform makes in modules/edge/main.tf.
function loadHandler(canonicalHost: string, redirectHosts: string[]) {
  const source = readFileSync(new URL('./viewer-request.js', import.meta.url), 'utf8')
    .replaceAll('__CANONICAL_HOST__', canonicalHost)
    .replaceAll('__REDIRECT_HOSTS__', redirectHosts.join(','));
  return new Function(`${source}\nreturn handler;`)() as (event: { request: CfRequest }) => unknown;
}

const handler = loadHandler('escolagratisdetecnologia.com.br', [
  'escolagratisdetecnologia.com',
  'www.escolagratisdetecnologia.com',
  'www.escolagratisdetecnologia.com.br',
]);

function event(
  uri: string,
  host = 'escolagratisdetecnologia.com.br',
  querystring: QueryString = {},
) {
  return { request: { uri, headers: { host: { value: host } }, querystring } };
}

describe('viewer-request', () => {
  it('redirects www regardless of host case', () => {
    expect(handler(event('/', 'WWW.EscolaGratisDeTecnologia.com.br'))).toMatchObject({
      statusCode: 301,
      headers: { location: { value: 'https://escolagratisdetecnologia.com.br/' } },
    });
  });

  it('serves index.html for the root path', () => {
    expect(handler(event('/'))).toMatchObject({ uri: '/index.html' });
  });

  it('serves index.html for directories with a trailing slash', () => {
    expect(handler(event('/cursos/'))).toMatchObject({ uri: '/cursos/index.html' });
  });

  it('serves index.html for directories without a trailing slash', () => {
    expect(handler(event('/cursos'))).toMatchObject({ uri: '/cursos/index.html' });
  });

  it('keeps file requests untouched', () => {
    expect(handler(event('/_astro/index.4f2a.css'))).toMatchObject({
      uri: '/_astro/index.4f2a.css',
    });
  });

  it('redirects www to the canonical host keeping path and query', () => {
    const result = handler(
      event('/cursos', 'www.escolagratisdetecnologia.com.br', {
        utm_source: { value: 'instagram' },
        tag: { value: 'a', multiValue: [{ value: 'a' }, { value: 'b' }] },
      }),
    );

    expect(result).toEqual({
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: {
          value: 'https://escolagratisdetecnologia.com.br/cursos?utm_source=instagram&tag=a&tag=b',
        },
      },
    });
  });

  it.each(['escolagratisdetecnologia.com', 'www.escolagratisdetecnologia.com'])(
    'redirects the old domain %s to the canonical host',
    (host) => {
      expect(handler(event('/cursos/python', host, { ref: { value: '' } }))).toMatchObject({
        statusCode: 301,
        headers: {
          location: { value: 'https://escolagratisdetecnologia.com.br/cursos/python?ref' },
        },
      });
    },
  );

  it('does not redirect other hosts', () => {
    expect(handler(event('/', 'd111111abcdef8.cloudfront.net'))).toMatchObject({
      uri: '/index.html',
    });
  });

  it('serves every host when there is nothing to redirect', () => {
    const dev = loadHandler('dev.escolagratisdetecnologia.com', []);

    expect(dev(event('/', 'www.dev.escolagratisdetecnologia.com'))).toMatchObject({
      uri: '/index.html',
    });
    expect(dev({ request: { uri: '/', headers: {}, querystring: {} } })).toMatchObject({
      uri: '/index.html',
    });
  });
});
