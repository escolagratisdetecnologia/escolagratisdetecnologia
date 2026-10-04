import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type QueryString = Record<string, { value: string; multiValue?: { value: string }[] }>;
interface CfRequest {
  uri: string;
  headers: Record<string, { value: string }>;
  querystring: QueryString;
}

const source = readFileSync(new URL('./viewer-request.js', import.meta.url), 'utf8').replaceAll(
  '__CANONICAL_HOST__',
  'escolagratisdetecnologia.com',
);
const handler = new Function(`${source}\nreturn handler;`)() as (event: {
  request: CfRequest;
}) => unknown;

function event(uri: string, host = 'escolagratisdetecnologia.com', querystring: QueryString = {}) {
  return { request: { uri, headers: { host: { value: host } }, querystring } };
}

describe('viewer-request', () => {
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
      event('/cursos', 'www.escolagratisdetecnologia.com', {
        utm_source: { value: 'instagram' },
        tag: { value: 'a', multiValue: [{ value: 'a' }, { value: 'b' }] },
      }),
    );

    expect(result).toEqual({
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: {
          value: 'https://escolagratisdetecnologia.com/cursos?utm_source=instagram&tag=a&tag=b',
        },
      },
    });
  });

  it('does not redirect other hosts', () => {
    expect(handler(event('/', 'd111111abcdef8.cloudfront.net'))).toMatchObject({
      uri: '/index.html',
    });
  });
});
