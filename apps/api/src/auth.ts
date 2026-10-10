import type { MiddlewareHandler } from 'hono';
import type { AppConfig } from './config.ts';
import { apiError } from './errors.ts';

export interface Identity {
  /** Stable learner id (Cognito `sub` from Phase 1C). */
  sub: string;
}

/** Finds out who is calling. Phase 1C plugs in the Cognito session; until then AWS has none. */
export type Authenticate = (request: Request) => Promise<Identity | null>;

export const noAuthentication: Authenticate = async () => null;

const DEV_USER = /^[a-z0-9-]{1,64}$/;

/** Fake login for local development: the x-dev-user header names the learner. */
export function createDevAuthenticator(config: AppConfig): Authenticate {
  if (config.environment !== 'local') {
    throw new Error('The dev authenticator only runs locally.');
  }
  return async (request) => {
    const sub = request.headers.get('x-dev-user');
    return sub !== null && DEV_USER.test(sub) ? { sub } : null;
  };
}

export type AuthEnv = { Variables: { identity: Identity } };

export function requireIdentity(authenticate: Authenticate): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const identity = await authenticate(c.req.raw);
    if (identity === null) {
      return c.json(apiError('unauthenticated', 'Entre na sua conta para continuar.'), 401);
    }
    c.set('identity', identity);
    await next();
  };
}
