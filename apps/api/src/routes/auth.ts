import { createHash, randomBytes } from 'node:crypto';
import type { Logger } from '@aws-lambda-powertools/logger';
import type { ProfileRepository } from '@egt/db';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppConfig } from '../config.ts';
import { apiError } from '../errors.ts';
import {
  ACCOUNT_LINKED,
  RateLimitedError,
  type IdentityProvider,
  type Tokens,
} from '../identity.ts';
import { clearSession, COOKIES, cookieOptions, setSession } from '../session.ts';

const LOGIN_MINUTES = 15;
const GOOGLE_MINUTES = 10;
const HOME = '/eu/';

const startBody = z.object({ email: z.email().max(254) });
const verifyBody = z.object({ code: z.string().regex(/^\d{6,8}$/) });
/** Only paths of the site itself (no other host, no query): where to go after signing in. */
const nextPath = z
  .string()
  .max(200)
  .regex(/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/);
const pendingGoogle = z.object({
  state: z.string(),
  verifier: z.string(),
  next: nextPath,
  retried: z.boolean(),
});
type PendingGoogle = z.infer<typeof pendingGoogle>;

const invalidRequest = apiError(
  'invalid_request',
  'Os dados enviados não estão no formato esperado.',
);
const rateLimited = apiError(
  'rate_limited',
  'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.',
);

const random = (bytes: number) => randomBytes(bytes).toString('base64url');
const encode = (value: PendingGoogle) => Buffer.from(JSON.stringify(value)).toString('base64url');

function decode(value: string | undefined): PendingGoogle | null {
  if (value === undefined) return null;
  try {
    const parsed = pendingGoogle.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface AuthDeps {
  config: AppConfig;
  logger: Logger;
  identity: IdentityProvider;
  profiles: ProfileRepository;
}

/** Sign-in with an e-mail code or Google, session refresh and logout (spec §3.4 and §5.2). */
export function authRoutes({ config, logger, identity, profiles }: AuthDeps) {
  const secure = config.environment !== 'local';
  const redirectUri = `${config.siteOrigin}/api/auth/callback`;

  /** Sets the session and tells whether the learner still has to finish sign-up. */
  async function signIn(c: Context, tokens: Tokens): Promise<boolean> {
    setSession(c, tokens, secure);
    const found = await identity.verifyAccessToken(tokens.accessToken);
    if (found === null) throw new Error('Identity provider issued an invalid access token');
    return (await profiles.get(found.sub)) !== null;
  }

  function startGoogle(c: Context, next: string, retried: boolean) {
    const pending = { state: random(16), verifier: random(32), next, retried };
    setCookie(
      c,
      COOKIES.oauth,
      encode(pending),
      cookieOptions(secure, '/api/auth', GOOGLE_MINUTES * 60),
    );
    const codeChallenge = createHash('sha256').update(pending.verifier).digest('base64url');
    return c.redirect(
      identity.googleAuthorizeUrl({ state: pending.state, codeChallenge, redirectUri }),
      302,
    );
  }

  return new Hono()
    .post('/email/start', async (c) => {
      const body = startBody.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json(invalidRequest, 400);
      try {
        const state = await identity.startEmailLogin(body.data.email.toLowerCase());
        setCookie(c, COOKIES.login, state, cookieOptions(secure, '/api/auth', LOGIN_MINUTES * 60));
        // Same answer for new and existing accounts: nobody learns who studies here.
        return c.json({ status: 'code_sent' });
      } catch (error) {
        if (error instanceof RateLimitedError) return c.json(rateLimited, 429);
        throw error;
      }
    })
    .post('/email/verify', async (c) => {
      const state = getCookie(c, COOKIES.login);
      if (state === undefined) {
        return c.json(
          apiError('login_expired', 'O tempo para digitar o código acabou. Peça um novo código.'),
          400,
        );
      }
      const body = verifyBody.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json(invalidRequest, 400);
      try {
        const result = await identity.finishEmailLogin(state, body.data.code);
        if ('error' in result) {
          return c.json(
            apiError(
              'invalid_code',
              'Código incorreto ou vencido. Confira o e-mail ou peça um novo código.',
            ),
            400,
          );
        }
        deleteCookie(c, COOKIES.login, { path: '/api/auth', secure });
        const profileComplete = await signIn(c, result.tokens);
        logger.info('signed_in', { method: 'email', profileComplete });
        return c.json({ profileComplete });
      } catch (error) {
        if (error instanceof RateLimitedError) return c.json(rateLimited, 429);
        throw error;
      }
    })
    .get('/google', (c) => {
      const next = nextPath.safeParse(c.req.query('next'));
      return startGoogle(c, next.success ? next.data : HOME, c.req.query('retry') === '1');
    })
    .get('/callback', async (c) => {
      const pending = decode(getCookie(c, COOKIES.oauth));
      deleteCookie(c, COOKIES.oauth, { path: '/api/auth', secure });
      const failed = () => c.redirect('/entrar/?erro=google', 302);
      if (pending === null || c.req.query('state') !== pending.state) return failed();

      const error = c.req.query('error');
      if (error !== undefined) {
        // The first Google sign-in of someone who already has an account links the two and
        // fails once on purpose (pre sign-up trigger): try again, only once (ADR 0024).
        if (!pending.retried && c.req.query('error_description')?.includes(ACCOUNT_LINKED)) {
          return startGoogle(c, pending.next, true);
        }
        logger.warn('google_sign_in_failed', { error });
        return failed();
      }

      const code = c.req.query('code');
      if (code === undefined) return failed();
      let tokens: Tokens;
      try {
        tokens = await identity.finishGoogleLogin({
          code,
          codeVerifier: pending.verifier,
          redirectUri,
        });
      } catch (exchangeError) {
        logger.warn('google_code_exchange_failed', { error: exchangeError });
        return failed();
      }
      const profileComplete = await signIn(c, tokens);
      logger.info('signed_in', { method: 'google', profileComplete });
      // The sign-in page finishes: sign-up when needed, then this device's progress.
      return c.redirect(`/entrar/?entrou=google&next=${encodeURIComponent(pending.next)}`, 302);
    })
    .post('/refresh', async (c) => {
      const refreshToken = getCookie(c, COOKIES.refresh);
      const tokens = refreshToken === undefined ? null : await identity.refresh(refreshToken);
      if (tokens === null) {
        clearSession(c, secure);
        return c.json(apiError('unauthenticated', 'Entre na sua conta para continuar.'), 401);
      }
      setSession(c, tokens, secure);
      return c.json({ status: 'refreshed' });
    })
    .post('/logout', async (c) => {
      const refreshToken = getCookie(c, COOKIES.refresh);
      if (refreshToken !== undefined) {
        try {
          await identity.revoke(refreshToken);
        } catch (error) {
          // The cookies go away anyway; the refresh token expires on its own.
          logger.warn('revoke_failed', { error });
        }
      }
      clearSession(c, secure);
      return c.json({ status: 'signed_out' });
    });
}
