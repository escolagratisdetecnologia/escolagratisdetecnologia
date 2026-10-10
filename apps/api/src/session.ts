import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import type { Tokens } from './identity.ts';

/** Session cookies (spec §5.2). Host-only (no Domain): other host names never get them. */
export const COOKIES = {
  /** Access token, sent to the whole API. */
  access: 'egt_at',
  /** Refresh token, only to /api/auth. */
  refresh: 'egt_rt',
  /** Readable by the site: only says "logged in" so the pages know when to sync. */
  hint: 'egt_hint',
  /** E-mail sign-in in progress (between asking for the code and typing it). */
  login: 'egt_login',
  /** Google sign-in in progress (state, PKCE verifier, where to go back). */
  oauth: 'egt_oauth',
} as const;

const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60;

/** Secure everywhere except local http://localhost (some browsers drop Secure cookies there). */
export const cookieOptions = (
  secure: boolean,
  path: string,
  maxAge: number,
  httpOnly = true,
): CookieOptions => ({ path, maxAge, httpOnly, secure, sameSite: 'Lax' });

export function setSession(c: Context, tokens: Tokens, secure: boolean): void {
  setCookie(c, COOKIES.access, tokens.accessToken, cookieOptions(secure, '/api', tokens.expiresIn));
  if (tokens.refreshToken !== undefined) {
    setCookie(
      c,
      COOKIES.refresh,
      tokens.refreshToken,
      cookieOptions(secure, '/api/auth', SESSION_DAYS * DAY),
    );
  }
  setCookie(c, COOKIES.hint, '1', cookieOptions(secure, '/', SESSION_DAYS * DAY, false));
}

export function clearSession(c: Context, secure: boolean): void {
  deleteCookie(c, COOKIES.access, { path: '/api', secure });
  deleteCookie(c, COOKIES.refresh, { path: '/api/auth', secure });
  deleteCookie(c, COOKIES.hint, { path: '/', secure });
}
