import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../src/session.ts';

async function cookiesOf(secure: boolean, action: 'set' | 'clear'): Promise<string[]> {
  const app = new Hono().get('/', (c) => {
    if (action === 'set') {
      setSession(c, { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 }, secure);
    } else {
      clearSession(c, secure);
    }
    return c.body(null, 204);
  });
  const res = await app.request('/');
  return res.headers.getSetCookie();
}

describe('session cookies', () => {
  it('keep the tokens away from scripts, each on the narrowest path', async () => {
    expect(await cookiesOf(true, 'set')).toEqual([
      'egt_at=at; Max-Age=3600; Path=/api; HttpOnly; Secure; SameSite=Lax',
      'egt_rt=rt; Max-Age=2592000; Path=/api/auth; HttpOnly; Secure; SameSite=Lax',
      'egt_hint=1; Max-Age=2592000; Path=/; Secure; SameSite=Lax',
    ]);
  });

  it('leave Secure out locally (plain http://localhost)', async () => {
    expect((await cookiesOf(false, 'set')).some((cookie) => cookie.includes('Secure'))).toBe(false);
  });

  it('are all removed on logout', async () => {
    const cookies = await cookiesOf(true, 'clear');

    expect(cookies.map((cookie) => cookie.split(';')[0])).toEqual([
      'egt_at=',
      'egt_rt=',
      'egt_hint=',
    ]);
    expect(cookies.every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  });
});
