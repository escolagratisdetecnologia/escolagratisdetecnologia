import type { Logger } from '@aws-lambda-powertools/logger';
import { latestBirthYear, TERMS_VERSION } from '@egt/core';
import type { ProfileRepository, ProgressRepository } from '@egt/db';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireIdentity, type AuthEnv } from '../auth.ts';
import type { AppConfig } from '../config.ts';
import { apiError } from '../errors.ts';
import type { IdentityProvider } from '../identity.ts';
import { clearSession } from '../session.ts';

const profileBody = z.object({
  birthYear: z.number().int().min(1900),
  acceptTerms: z.literal(true),
});

export interface MeDeps {
  config: AppConfig;
  logger: Logger;
  identity: IdentityProvider;
  profiles: ProfileRepository;
  progress: ProgressRepository;
  now?: () => Date;
}

/** The learner's own account: profile, sign-up, data export and deletion (spec §5.5). */
export function meRoutes({
  config,
  logger,
  identity,
  profiles,
  progress,
  now = () => new Date(),
}: MeDeps) {
  const secure = config.environment !== 'local';

  /** A token outlives a deleted account until it expires: treat that as signed out. */
  function accountGone(c: Context) {
    clearSession(c, secure);
    return c.json(apiError('unauthenticated', 'Entre na sua conta para continuar.'), 401);
  }

  return new Hono<AuthEnv>()
    .use(requireIdentity(identity))
    .get('/', async (c) => {
      const { sub } = c.var.identity;
      const email = await identity.email(sub);
      if (email === null) return accountGone(c);
      return c.json({ email, profile: await profiles.get(sub) });
    })
    .patch('/', async (c) => {
      const body = profileBody.safeParse(await c.req.json().catch(() => undefined));
      const today = now();
      if (!body.success || body.data.birthYear > today.getUTCFullYear()) {
        return c.json(
          apiError('invalid_request', 'Os dados enviados não estão no formato esperado.'),
          400,
        );
      }
      const { sub } = c.var.identity;
      if ((await identity.email(sub)) === null) return accountGone(c);
      // A finished sign-up is never undone here, whatever the birth year says.
      if ((await profiles.get(sub)) !== null) {
        return c.json(apiError('profile_exists', 'Seu cadastro já está completo.'), 409);
      }

      const limit = latestBirthYear(today);
      if (body.data.birthYear > limit) {
        // Nothing else was stored: learning data needs a complete sign-up.
        await identity.deleteUser(sub);
        clearSession(c, secure);
        logger.info('sign_up_refused_age');
        return c.json(
          apiError(
            'too_young',
            `Por enquanto, a Escola é para quem nasceu até ${limit}. Apagamos o cadastro que você começou.`,
          ),
          400,
        );
      }

      const at = today.toISOString();
      const profile = {
        birthYear: body.data.birthYear,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: at,
        createdAt: at,
      };
      if ((await profiles.create(sub, profile)) === 'exists') {
        return c.json(apiError('profile_exists', 'Seu cadastro já está completo.'), 409);
      }
      logger.info('sign_up_completed');
      return c.json({ profile }, 201);
    })
    .get('/export', async (c) => {
      const { sub } = c.var.identity;
      const email = await identity.email(sub);
      if (email === null) return accountGone(c);
      const [profile, learning] = await Promise.all([profiles.get(sub), progress.get(sub)]);
      c.header('content-disposition', 'attachment; filename="meus-dados-escola-gratis.json"');
      return c.json({
        exportedAt: now().toISOString(),
        account: { email },
        profile,
        progress: learning,
      });
    })
    .delete('/', async (c) => {
      const { sub } = c.var.identity;
      // Data first: if the account deletion fails, a retry finds the account and finishes.
      await progress.deleteAll(sub);
      await profiles.delete(sub);
      await identity.deleteUser(sub);
      clearSession(c, secure);
      logger.info('account_deleted');
      return c.json({ status: 'deleted' });
    });
}
