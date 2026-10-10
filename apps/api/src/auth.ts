import type { ProfileRepository } from '@egt/db';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { apiError } from './errors.ts';
import type { Identity, IdentityProvider } from './identity.ts';
import { COOKIES } from './session.ts';

export type AuthEnv = { Variables: { identity: Identity } };

/** Personal routes: the access token cookie must be valid. */
export function requireIdentity(identity: IdentityProvider): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const token = getCookie(c, COOKIES.access);
    const found = token === undefined ? null : await identity.verifyAccessToken(token);
    if (found === null) {
      return c.json(apiError('unauthenticated', 'Entre na sua conta para continuar.'), 401);
    }
    c.set('identity', found);
    await next();
  };
}

/** Learning data only after sign-up is complete (age check and terms, spec §5.5). */
export function requireProfile(profiles: ProfileRepository): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    if ((await profiles.get(c.var.identity.sub)) === null) {
      return c.json(apiError('profile_required', 'Complete seu cadastro para continuar.'), 409);
    }
    await next();
  };
}
