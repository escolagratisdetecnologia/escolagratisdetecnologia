import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLocalIdentity, localSub } from '../src/identity/local.ts';

const settings = {
  mailpitUrl: 'http://mailpit.test',
  googleIssuer: 'http://google.test/google',
};

/** Mailpit and the fake Google, answering from memory. */
function services(idToken?: () => Promise<string>, jwks?: unknown) {
  const mail: { To: { Email: string }[]; Subject: string; Text: string }[] = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    if (target === 'http://mailpit.test/api/v1/send') {
      mail.push(JSON.parse(String(init?.body)));
      return Response.json({ ID: 'x' });
    }
    if (target === 'http://google.test/google/token' && idToken !== undefined) {
      return Response.json({ id_token: await idToken() });
    }
    if (target === 'http://google.test/google/jwks') return Response.json(jwks);
    return new Response('not found', { status: 404 });
  };
  return { mail, fetch: fakeFetch as typeof fetch };
}

describe('local e-mail sign-in', () => {
  it('sends the code to Mailpit and the console, and signs in with it', async () => {
    const printed: string[] = [];
    const { mail, fetch } = services();
    const identity = await createLocalIdentity(settings, {
      fetch,
      print: (message) => printed.push(message),
    });

    const state = await identity.startEmailLogin('ana@example.com');
    const code = /(\d{6})/.exec(printed[0] ?? '')?.[1] ?? '';
    const result = await identity.finishEmailLogin(state, code);

    expect(mail[0]?.To).toEqual([{ Email: 'ana@example.com' }]);
    expect(mail[0]?.Subject).toBe(`Seu código para entrar: ${code}`);
    expect('tokens' in result).toBe(true);
    if (!('tokens' in result)) return;
    const sub = localSub('ana@example.com');
    expect(await identity.verifyAccessToken(result.tokens.accessToken)).toEqual({ sub });
    expect(await identity.email(sub)).toBe('ana@example.com');
  });

  it('works without Mailpit, with the code on the console', async () => {
    const printed: string[] = [];
    const identity = await createLocalIdentity(settings, {
      fetch: async () => {
        throw new Error('connection refused');
      },
      print: (message) => printed.push(message),
    });

    const state = await identity.startEmailLogin('ana@example.com');

    expect(printed[0]).toMatch(/^Código para entrar na Escola \(só no ambiente local\): \d{6}$/);
    expect(state).toMatch(/^[\w-]{36}$/);
  });

  it('refuses wrong codes, expired codes and codes after five mistakes', async () => {
    const printed: string[] = [];
    let clock = 0;
    const identity = await createLocalIdentity(settings, {
      fetch: services().fetch,
      print: (message) => printed.push(message),
      now: () => clock,
    });
    const codeOf = (index: number) => /(\d{6})/.exec(printed[index] ?? '')?.[1] ?? '';

    const expiring = await identity.startEmailLogin('ana@example.com');
    clock = 16 * 60_000;
    expect(await identity.finishEmailLogin(expiring, codeOf(0))).toEqual({ error: 'invalid_code' });

    const guessed = await identity.startEmailLogin('ana@example.com');
    const wrong = codeOf(1) === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await identity.finishEmailLogin(guessed, wrong)).toEqual({ error: 'invalid_code' });
    }
    expect(await identity.finishEmailLogin(guessed, codeOf(1))).toEqual({ error: 'invalid_code' });
  });

  it('gives the same learner to the same e-mail, and only trusts its own tokens', async () => {
    const other = await createLocalIdentity(settings, { fetch: services().fetch, print: () => {} });
    const printed: string[] = [];
    const identity = await createLocalIdentity(settings, {
      fetch: services().fetch,
      print: (message) => printed.push(message),
    });
    const state = await identity.startEmailLogin('ana@example.com');
    const result = await identity.finishEmailLogin(
      state,
      /(\d{6})/.exec(printed[0] ?? '')?.[1] ?? '',
    );
    if (!('tokens' in result)) throw new Error('sign-in failed');

    expect(localSub('ana@example.com')).toBe(localSub('ana@example.com'));
    expect(localSub('ana@example.com')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(await other.verifyAccessToken(result.tokens.accessToken)).toBeNull();
    expect(await identity.verifyAccessToken('lixo')).toBeNull();
  });
});

describe('local sessions', () => {
  it('rotates refresh tokens and ends them on logout and deletion', async () => {
    const printed: string[] = [];
    const identity = await createLocalIdentity(settings, {
      fetch: services().fetch,
      print: (message) => printed.push(message),
    });
    const signIn = async () => {
      const state = await identity.startEmailLogin('ana@example.com');
      const result = await identity.finishEmailLogin(
        state,
        /(\d{6})/.exec(printed.at(-1) ?? '')?.[1] ?? '',
      );
      if (!('tokens' in result)) throw new Error('sign-in failed');
      return result.tokens.refreshToken ?? '';
    };

    const first = await signIn();
    const refreshed = await identity.refresh(first);
    expect(refreshed?.refreshToken).not.toBe(first);
    expect(await identity.refresh(first)).toBeNull();

    await identity.revoke(refreshed?.refreshToken ?? '');
    expect(await identity.refresh(refreshed?.refreshToken ?? '')).toBeNull();

    const last = await signIn();
    await identity.deleteUser(localSub('ana@example.com'));
    expect(await identity.refresh(last)).toBeNull();
    expect(await identity.email(localSub('ana@example.com'))).toBeNull();
  });
});

describe('local Google sign-in', () => {
  let privateKey: CryptoKey;
  let jwks: unknown;

  beforeAll(async () => {
    const keys = await generateKeyPair('RS256');
    privateKey = keys.privateKey;
    jwks = { keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'google', alg: 'RS256' }] };
  });

  const idToken =
    (claims: Record<string, unknown>, issuer = settings.googleIssuer) =>
    () =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'google' })
        .setIssuer(issuer)
        .setAudience('egt-local')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

  const request = {
    code: 'c',
    codeVerifier: 'v',
    redirectUri: 'http://localhost:4321/api/auth/callback',
  };

  it('goes to mock-oauth2-server with PKCE', async () => {
    const identity = await createLocalIdentity(settings, { fetch: services().fetch });

    const url = new URL(
      identity.googleAuthorizeUrl({ state: 'e', codeChallenge: 'd', redirectUri: 'http://x/cb' }),
    );

    expect(url.origin + url.pathname).toBe('http://google.test/google/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('client_id')).toBe('egt-local');
  });

  it('signs in with the e-mail Google confirms', async () => {
    const { fetch } = services(idToken({ sub: 'qualquer', email: 'Bia@Example.com' }), jwks);
    const identity = await createLocalIdentity(settings, { fetch });

    const tokens = await identity.finishGoogleLogin(request);

    expect(await identity.verifyAccessToken(tokens.accessToken)).toEqual({
      sub: localSub('bia@example.com'),
    });
  });

  it('takes the e-mail typed as user on the mock login page', async () => {
    const { fetch } = services(idToken({ sub: 'cris@example.com' }), jwks);
    const identity = await createLocalIdentity(settings, { fetch });

    const tokens = await identity.finishGoogleLogin(request);

    expect(await identity.email(localSub('cris@example.com'))).toBe('cris@example.com');
    expect(tokens.refreshToken).toBeDefined();
  });

  it('refuses tokens without an e-mail or from another issuer', async () => {
    for (const token of [
      idToken({ sub: 'sem-email' }),
      idToken({ sub: 'x', email: 'ana@example.com' }, 'http://outro.test'),
    ]) {
      const identity = await createLocalIdentity(settings, { fetch: services(token, jwks).fetch });

      await expect(identity.finishGoogleLogin(request)).rejects.toThrow();
    }
  });
});
