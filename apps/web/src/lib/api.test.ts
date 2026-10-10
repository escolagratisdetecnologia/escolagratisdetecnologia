// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, UNAVAILABLE } from './api.ts';

const json = (body: unknown, status = 200) => Response.json(body, { status });

function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { path: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    calls.push({ path, init });
    const next = responses.shift();
    if (next === undefined || next instanceof Error) throw next ?? new Error('no response');
    return next;
  });
  return calls;
}

describe('api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'egt_hint=; max-age=0; path=/';
  });

  it('sends JSON with the session cookies and reads JSON back', async () => {
    const calls = fakeFetch(json({ profile: null }, 201));

    const res = await api('/api/me', { method: 'PATCH', body: { birthYear: 2000 } });

    expect(res).toEqual({ ok: true, status: 201, data: { profile: null } });
    expect(calls[0]?.init).toMatchObject({
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{"birthYear":2000}',
    });
  });

  it('passes on the error of the API', async () => {
    fakeFetch(json({ error: { code: 'invalid_code', message: 'Código incorreto.' } }, 400));

    expect(await api('/api/auth/email/verify')).toEqual({
      ok: false,
      status: 400,
      error: { code: 'invalid_code', message: 'Código incorreto.' },
    });
  });

  it('turns pages from the CDN or the WAF and network failures into a generic error', async () => {
    fakeFetch(
      new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } }),
      new Error('offline'),
    );

    expect(await api('/api/progress')).toEqual({ ok: false, status: 404, error: UNAVAILABLE });
    expect(await api('/api/progress')).toEqual({ ok: false, status: 0, error: UNAVAILABLE });
  });

  it('renews an expired session once and tries again', async () => {
    document.cookie = 'egt_hint=1; path=/';
    const expired = json({ error: { code: 'unauthenticated', message: 'Entre.' } }, 401);
    const calls = fakeFetch(expired, json({ status: 'refreshed' }), json({ email: 'a@b.c' }));

    const res = await api('/api/me');

    expect(res.ok).toBe(true);
    expect(calls.map(({ path, init }) => `${init.method} ${path}`)).toEqual([
      'GET /api/me',
      'POST /api/auth/refresh',
      'GET /api/me',
    ]);
  });

  it('does not try to renew without a session', async () => {
    const calls = fakeFetch(json({ error: { code: 'unauthenticated', message: 'Entre.' } }, 401));

    const res = await api('/api/me');

    expect(res.status).toBe(401);
    expect(calls).toHaveLength(1);
  });
});
