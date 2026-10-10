import { describe, expect, it } from 'vitest';
import { CODE, createFakeIdentity, s256 } from './fake-identity.ts';
import { SITE, testApp } from './helpers.ts';

/** `name=value` pairs of the Set-Cookie headers, ready for a Cookie header. */
const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
const setCookie = (res: Response, name: string) =>
  res.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));

const json = (body: unknown, cookie?: string) => ({
  method: 'POST',
  headers: {
    origin: SITE,
    'content-type': 'application/json',
    ...(cookie === undefined ? {} : { cookie }),
  },
  body: JSON.stringify(body),
});

async function askForCode(app: ReturnType<typeof testApp>, email: string) {
  const res = await app.request('/api/auth/email/start', json({ email }));
  return cookieHeader(res);
}

describe('POST /api/auth/email/start', () => {
  it('sends a code and keeps the sign-in state in an HttpOnly cookie', async () => {
    const res = await testApp().request(
      '/api/auth/email/start',
      json({ email: 'Ana@Example.com' }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'code_sent' });
    expect(setCookie(res, 'egt_login')).toBe(
      'egt_login=state.1; Max-Age=900; Path=/api/auth; HttpOnly; SameSite=Lax',
    );
  });

  it('answers the same for new and existing accounts', async () => {
    const existing = await testApp().request(
      '/api/auth/email/start',
      json({ email: 'ana@example.com' }),
    );
    const brandNew = await testApp().request(
      '/api/auth/email/start',
      json({ email: 'novo@example.com' }),
    );

    expect([existing.status, await existing.json()]).toEqual([
      brandNew.status,
      await brandNew.json(),
    ]);
  });

  it('refuses what is not an e-mail', async () => {
    for (const body of [{ email: 'ana' }, { email: '' }, {}]) {
      const res = await testApp().request('/api/auth/email/start', json(body));

      expect(res.status).toBe(400);
    }
  });

  it('answers 429 when the provider asks to slow down', async () => {
    const identity = createFakeIdentity();
    identity.rateLimited = true;

    const res = await testApp({ identity }).request(
      '/api/auth/email/start',
      json({ email: 'ana@example.com' }),
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
      },
    });
  });
});

describe('POST /api/auth/email/verify', () => {
  it('signs in with the right code and tells the sign-up is complete', async () => {
    const app = testApp();
    const login = await askForCode(app, 'ana@example.com');

    const res = await app.request('/api/auth/email/verify', json({ code: CODE }, login));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profileComplete: true });
    expect(setCookie(res, 'egt_at')).toMatch(/^egt_at=access\.ana; Max-Age=3600; Path=\/api;/);
    expect(setCookie(res, 'egt_rt')).toMatch(/^egt_rt=refresh\.ana\.\d+; .*Path=\/api\/auth;/);
    expect(setCookie(res, 'egt_hint')).toMatch(/^egt_hint=1;/);
    expect(setCookie(res, 'egt_login')).toMatch(/^egt_login=; Max-Age=0;/);
  });

  it('asks a new learner to finish sign-up', async () => {
    const app = testApp();
    const login = await askForCode(app, 'cris@example.com');

    const res = await app.request('/api/auth/email/verify', json({ code: CODE }, login));

    expect(await res.json()).toEqual({ profileComplete: false });
  });

  it('refuses a wrong code and keeps the sign-in going', async () => {
    const app = testApp();
    const login = await askForCode(app, 'ana@example.com');

    const res = await app.request('/api/auth/email/verify', json({ code: '000000' }, login));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'invalid_code',
        message: 'Código incorreto ou vencido. Confira o e-mail ou peça um novo código.',
      },
    });
    expect(setCookie(res, 'egt_login')).toBeUndefined();
    const retry = await app.request('/api/auth/email/verify', json({ code: CODE }, login));
    expect(retry.status).toBe(200);
  });

  it('accepts codes with 6 to 8 digits only', async () => {
    const app = testApp();
    const login = await askForCode(app, 'ana@example.com');

    for (const code of ['12345', '123456789', 'abcdef']) {
      const res = await app.request('/api/auth/email/verify', json({ code }, login));

      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        'invalid_request',
      );
    }
  });

  it('asks for a new code when the sign-in state is gone', async () => {
    const res = await testApp().request('/api/auth/email/verify', json({ code: CODE }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'login_expired',
        message: 'O tempo para digitar o código acabou. Peça um novo código.',
      },
    });
  });
});

describe('Google sign-in', () => {
  async function goToGoogle(app: ReturnType<typeof testApp>, query = '') {
    const res = await app.request(`/api/auth/google${query}`);
    const location = new URL(res.headers.get('location') ?? '');
    return { res, location, cookie: cookieHeader(res) };
  }

  it('sends the browser to Google with state and PKCE', async () => {
    const { res, location } = await goToGoogle(testApp(), '?next=/cursos/');

    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe('https://google.example/authorize');
    expect(location.searchParams.get('redirect_uri')).toBe(`${SITE}/api/auth/callback`);
    expect(location.searchParams.get('state')).toMatch(/^[\w-]{22}$/);
    expect(location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(setCookie(res, 'egt_oauth')).toMatch(
      /^egt_oauth=[\w-]+; Max-Age=600; Path=\/api\/auth; HttpOnly; SameSite=Lax$/,
    );
  });

  async function callback(app: ReturnType<typeof testApp>, email: string, next = '') {
    const { location, cookie } = await goToGoogle(app, next);
    const state = location.searchParams.get('state') ?? '';
    const challenge = location.searchParams.get('code_challenge') ?? '';
    const code = `google:${email}:${challenge}`;
    return app.request(`/api/auth/callback?code=${encodeURIComponent(code)}&state=${state}`, {
      headers: { cookie },
    });
  }

  it('signs in and lets the sign-in page finish, keeping where to go next', async () => {
    const res = await callback(testApp(), 'ana@example.com', '?next=/cursos/site/');

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/entrar/?entrou=google&next=%2Fcursos%2Fsite%2F');
    expect(setCookie(res, 'egt_at')).toMatch(/^egt_at=access\.ana;/);
    expect(setCookie(res, 'egt_oauth')).toMatch(/^egt_oauth=; Max-Age=0;/);
  });

  it('never goes back to another site', async () => {
    for (const next of ['//evil.example', 'https://evil.example', '/eu/?x=1', '/../x']) {
      const res = await callback(testApp(), 'ana@example.com', `?next=${encodeURIComponent(next)}`);

      expect(res.headers.get('location')).toBe('/entrar/?entrou=google&next=%2Feu%2F');
    }
  });

  it('refuses a callback without the matching state', async () => {
    const app = testApp();
    const { location, cookie } = await goToGoogle(app);
    const challenge = location.searchParams.get('code_challenge') ?? '';
    const code = encodeURIComponent(`google:ana@example.com:${challenge}`);

    for (const headers of [{}, { cookie }]) {
      const res = await app.request(`/api/auth/callback?code=${code}&state=outro`, { headers });

      expect(res.headers.get('location')).toBe('/entrar/?erro=google');
      expect(setCookie(res, 'egt_at')).toBeUndefined();
    }
  });

  it('tries once more when Cognito has just linked Google to an account', async () => {
    const app = testApp();
    const first = await goToGoogle(app, '?next=/cursos/');
    const state = first.location.searchParams.get('state') ?? '';
    const failure = `error=invalid_request&error_description=${encodeURIComponent('PreSignUp failed with error ACCOUNT_LINKED.')}`;

    const retry = await app.request(`/api/auth/callback?${failure}&state=${state}`, {
      headers: { cookie: first.cookie },
    });

    expect(retry.status).toBe(302);
    expect(new URL(retry.headers.get('location') ?? '').origin).toBe('https://google.example');
    const second = new URL(retry.headers.get('location') ?? '');
    const giveUp = await app.request(
      `/api/auth/callback?${failure}&state=${second.searchParams.get('state')}`,
      { headers: { cookie: cookieHeader(retry) } },
    );
    expect(giveUp.headers.get('location')).toBe('/entrar/?erro=google');
  });

  it('does not retry other Google errors', async () => {
    const app = testApp();
    const { location, cookie } = await goToGoogle(app);

    const res = await app.request(
      `/api/auth/callback?error=access_denied&state=${location.searchParams.get('state')}`,
      { headers: { cookie } },
    );

    expect(res.headers.get('location')).toBe('/entrar/?erro=google');
  });

  it('gives up when the code exchange fails', async () => {
    const app = testApp();
    const { location, cookie } = await goToGoogle(app);
    const code = encodeURIComponent(`google:ana@example.com:${s256('outro-verifier')}`);

    const res = await app.request(
      `/api/auth/callback?code=${code}&state=${location.searchParams.get('state')}`,
      { headers: { cookie } },
    );

    expect(res.headers.get('location')).toBe('/entrar/?erro=google');
  });
});

describe('session refresh and logout', () => {
  async function signedIn(app: ReturnType<typeof testApp>) {
    const login = await askForCode(app, 'ana@example.com');
    const res = await app.request('/api/auth/email/verify', json({ code: CODE }, login));
    return cookieHeader(res);
  }

  it('POST /refresh swaps the tokens', async () => {
    const app = testApp();
    const session = await signedIn(app);

    const res = await app.request('/api/auth/refresh', json({}, session));

    expect(res.status).toBe(200);
    expect(setCookie(res, 'egt_at')).toMatch(/^egt_at=access\.ana;/);
    expect(setCookie(res, 'egt_rt')).not.toBe(session.match(/egt_rt=[^;]+/)?.[0]);
  });

  it('POST /refresh signs out when the refresh token no longer works', async () => {
    const res = await testApp().request('/api/auth/refresh', json({}, 'egt_rt=velho'));

    expect(res.status).toBe(401);
    expect(setCookie(res, 'egt_hint')).toMatch(/^egt_hint=; Max-Age=0;/);
  });

  it('POST /logout ends the session and removes the cookies', async () => {
    const identity = createFakeIdentity();
    const app = testApp({ identity });
    const session = await signedIn(app);

    const res = await app.request('/api/auth/logout', json({}, session));

    expect(res.status).toBe(200);
    expect(identity.revoked).toEqual([session.match(/egt_rt=([^;]+)/)?.[1]]);
    expect(res.headers.getSetCookie().every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  });

  it('POST /logout works even without a session', async () => {
    const res = await testApp().request('/api/auth/logout', json({}));

    expect(res.status).toBe(200);
  });
});
