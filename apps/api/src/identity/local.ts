import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, customFetch, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import type { CodeCheck, IdentityProvider, Tokens } from '../identity.ts';

export interface LocalIdentitySettings {
  /** Mailpit HTTP API, where the codes arrive (http://localhost:8025). */
  mailpitUrl: string;
  /** Issuer of the fake Google, mock-oauth2-server (http://localhost:8080/google). */
  googleIssuer: string;
}

export interface LocalIdentityOptions {
  fetch?: typeof fetch;
  /** Where the code is printed too, so sign-in works without Mailpit. */
  print?: (message: string) => void;
  now?: () => number;
}

const CLIENT_ID = 'egt-local';
const ISSUER = 'egt-local';
const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;

/** Same e-mail, same learner across restarts: the progress in DynamoDB Local stays theirs. */
export function localSub(email: string): string {
  const hex = createHash('sha256').update(email).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Cognito stand-in for `pnpm dev` and the e2e tests: codes go to Mailpit (and the console),
 * Google is mock-oauth2-server, and tokens are signed with a key that lives in this process.
 * Accounts live in memory: after a restart, everyone signs in again.
 */
export async function createLocalIdentity(
  { mailpitUrl, googleIssuer }: LocalIdentitySettings,
  options: LocalIdentityOptions = {},
): Promise<IdentityProvider> {
  const fetchFn = options.fetch ?? fetch;
  const print = options.print ?? console.log;
  const now = options.now ?? Date.now;
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const googleKeys = createRemoteJWKSet(new URL(`${googleIssuer}/jwks`), {
    [customFetch]: fetchFn,
  });
  const accounts = new Map<string, string>();
  const codes = new Map<
    string,
    { email: string; code: string; expiresAt: number; attempts: number }
  >();
  const refreshTokens = new Map<string, string>();

  async function tokensFor(email: string): Promise<Tokens> {
    const sub = localSub(email);
    accounts.set(sub, email);
    const accessToken = await new SignJWT({ token_use: 'access', client_id: CLIENT_ID })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(sub)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const refreshToken = randomBytes(32).toString('base64url');
    refreshTokens.set(refreshToken, sub);
    return { accessToken, refreshToken, expiresIn: 3600 };
  }

  async function sendCode(email: string, code: string) {
    print(`Código para entrar na Escola (só no ambiente local): ${code}`);
    try {
      await fetchFn(`${mailpitUrl}/api/v1/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          From: { Email: 'nao-responda@escola.local', Name: 'Escola Grátis de Tecnologia' },
          To: [{ Email: email }],
          Subject: `Seu código para entrar: ${code}`,
          Text: `Use o código ${code} para entrar na Escola Grátis de Tecnologia. Ele vale por ${CODE_MINUTES} minutos.`,
        }),
      });
    } catch {
      // Mailpit is down: the code is on the console.
    }
  }

  return {
    async startEmailLogin(email) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const state = randomUUID();
      codes.set(state, { email, code, expiresAt: now() + CODE_MINUTES * 60_000, attempts: 0 });
      await sendCode(email, code);
      return state;
    },

    async finishEmailLogin(state, code): Promise<CodeCheck> {
      const pending = codes.get(state);
      if (pending === undefined || pending.expiresAt < now()) return { error: 'invalid_code' };
      if (pending.code !== code) {
        pending.attempts += 1;
        if (pending.attempts >= MAX_ATTEMPTS) codes.delete(state);
        return { error: 'invalid_code' };
      }
      codes.delete(state);
      return { tokens: await tokensFor(pending.email) };
    },

    googleAuthorizeUrl({ state, codeChallenge, redirectUri }) {
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        scope: 'openid email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      return `${googleIssuer}/authorize?${query}`;
    },

    async finishGoogleLogin({ code, codeVerifier, redirectUri }) {
      const res = await fetchFn(`${googleIssuer}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      if (!res.ok) throw new Error(`Fake Google token endpoint answered ${res.status}`);
      const { id_token: idToken } = z.object({ id_token: z.string() }).parse(await res.json());
      const { payload } = await jwtVerify(idToken, googleKeys, {
        issuer: googleIssuer,
        audience: CLIENT_ID,
      });
      // On the mock login page, type the e-mail as the user (or send an "email" claim).
      const email = typeof payload.email === 'string' ? payload.email : payload.sub;
      if (email === undefined || !email.includes('@')) {
        throw new Error('Fake Google sign-in without an e-mail');
      }
      return tokensFor(email.toLowerCase());
    },

    async refresh(refreshToken) {
      const sub = refreshTokens.get(refreshToken);
      refreshTokens.delete(refreshToken);
      const email = sub === undefined ? undefined : accounts.get(sub);
      return email === undefined ? null : tokensFor(email);
    },

    async revoke(refreshToken) {
      refreshTokens.delete(refreshToken);
    },

    async verifyAccessToken(accessToken) {
      try {
        const { payload } = await jwtVerify(accessToken, publicKey, { issuer: ISSUER });
        return payload.sub === undefined ? null : { sub: payload.sub };
      } catch {
        return null;
      }
    },

    async email(sub) {
      return accounts.get(sub) ?? null;
    },

    async deleteUser(sub) {
      accounts.delete(sub);
      for (const [token, owner] of refreshTokens) if (owner === sub) refreshTokens.delete(token);
    },
  };
}
