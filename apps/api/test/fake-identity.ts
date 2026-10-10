import { createHash } from 'node:crypto';
import { RateLimitedError, type IdentityProvider, type Tokens } from '../src/identity.ts';

/** The only code the fake accepts. */
export const CODE = '123456';

export const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/** Identity provider for route tests: codes are always 123456 and tokens say whose they are. */
export interface FakeIdentity extends IdentityProvider {
  /** e-mail → sub of every account. */
  accounts: Map<string, string>;
  /** While true, starting a sign-in fails with RateLimitedError. */
  rateLimited: boolean;
  /** Refresh tokens ended by logout. */
  revoked: string[];
}

/**
 * Accounts are created on the first sign-in with the part of the e-mail before the @ as `sub`.
 * The fake Google sends back the code `google:<e-mail>:<PKCE challenge>`.
 */
export function createFakeIdentity(accounts: Record<string, string> = {}): FakeIdentity {
  const refreshTokens = new Map<string, string>();
  const pending = new Map<string, string>();
  let counter = 0;

  const subOf = (email: string) => {
    const existing = fake.accounts.get(email);
    if (existing !== undefined) return existing;
    const sub = email.slice(0, email.indexOf('@'));
    fake.accounts.set(email, sub);
    return sub;
  };
  const tokensFor = (sub: string): Tokens => {
    const refreshToken = `refresh.${sub}.${++counter}`;
    refreshTokens.set(refreshToken, sub);
    return { accessToken: `access.${sub}`, refreshToken, expiresIn: 3600 };
  };

  const fake: FakeIdentity = {
    accounts: new Map(Object.entries(accounts)),
    rateLimited: false,
    revoked: [],
    async startEmailLogin(email) {
      if (fake.rateLimited) throw new RateLimitedError();
      const state = `state.${++counter}`;
      pending.set(state, email);
      return state;
    },
    async finishEmailLogin(state, code) {
      const email = pending.get(state);
      if (email === undefined || code !== CODE) return { error: 'invalid_code' };
      pending.delete(state);
      return { tokens: tokensFor(subOf(email)) };
    },
    googleAuthorizeUrl({ state, codeChallenge, redirectUri }) {
      const query = new URLSearchParams({
        state,
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
      });
      return `https://google.example/authorize?${query}`;
    },
    async finishGoogleLogin({ code, codeVerifier }) {
      const [, email = '', challenge] = code.split(':');
      if (challenge !== s256(codeVerifier)) throw new Error('PKCE mismatch');
      return tokensFor(subOf(email));
    },
    async refresh(refreshToken) {
      const sub = refreshTokens.get(refreshToken);
      if (sub === undefined) return null;
      refreshTokens.delete(refreshToken);
      return tokensFor(sub);
    },
    async revoke(refreshToken) {
      refreshTokens.delete(refreshToken);
      fake.revoked.push(refreshToken);
    },
    // Like Cognito, a signed access token stays valid until it expires, even after deletion.
    async verifyAccessToken(token) {
      return token.startsWith('access.') ? { sub: token.slice('access.'.length) } : null;
    },
    async email(sub) {
      for (const [email, owner] of fake.accounts) if (owner === sub) return email;
      return null;
    },
    async deleteUser(sub) {
      for (const [email, owner] of fake.accounts) if (owner === sub) fake.accounts.delete(email);
    },
  };
  return fake;
}
